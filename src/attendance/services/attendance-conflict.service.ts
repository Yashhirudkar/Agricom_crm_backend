import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceException, AttendanceExceptionStatus } from '../models/attendance-exception.model';
import { AttendanceRecord, AttendanceStatus } from '../models/attendance-record.model';
import { LeaveRequest, LeaveRequestStatus, HalfDayType } from '../../hrms/models/leave-request.model';
import { Employee } from '../../hrms/models/employee.model';
import { User } from '../../users/models/user.model';
import { Role } from '../../rbac/models/role.model';
import { UserCompany } from '../../users/models/user-company.model';
import { EmployeeLeaveBalance } from '../../hrms/models/employee-leave-balance.model';
import { LeaveBalanceHistory } from '../../hrms/models/leave-balance-history.model';
import { AuditLog } from '../../audit/models/audit-log.model';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import { Op, Transaction } from 'sequelize';

@Injectable()
export class AttendanceConflictService {
  constructor(
    @InjectModel(AttendanceException)
    private readonly exceptionModel: typeof AttendanceException,
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(EmployeeLeaveBalance)
    private readonly leaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(LeaveBalanceHistory)
    private readonly leaveBalanceHistoryModel: typeof LeaveBalanceHistory,
    @InjectModel(AuditLog)
    private readonly auditLogModel: typeof AuditLog,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Conflict Detection check. Runs during Check-In, Manual entry, and Leave approval.
   */
  async checkAndCreateLeaveConflict(
    employeeId: number,
    companyId: number,
    date: string,
    attendanceRecordId: number,
    transaction?: Transaction,
  ): Promise<AttendanceException | null> {
    // 1. Check if approved leave request exists for the employee on the given date
    const activeLeave = await this.leaveRequestModel.findOne({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.lte]: date },
        toDate: { [Op.gte]: date },
      },
      transaction,
    });

    if (!activeLeave) {
      return null;
    }

    // 2. Business Rule 1: Check if an unresolved conflict already exists
    const existingConflict = await this.exceptionModel.findOne({
      where: {
        employeeId,
        attendanceId: attendanceRecordId,
        leaveId: activeLeave.id,
        exceptionType: 'LEAVE_CONFLICT',
        status: { [Op.in]: [AttendanceExceptionStatus.OPEN, AttendanceExceptionStatus.UNDER_REVIEW] },
      },
      transaction,
    });

    if (existingConflict) {
      return existingConflict;
    }

    // 3. Determine Priority (Full day leave = HIGH, Half day leave = MEDIUM)
    const priority = activeLeave.isHalfDay ? 'MEDIUM' : 'HIGH';

    // 4. Create conflict exception
    const conflict = await this.exceptionModel.create(
      {
        companyId,
        employeeId,
        attendanceId: attendanceRecordId,
        leaveId: activeLeave.id,
        exceptionType: 'LEAVE_CONFLICT',
        status: AttendanceExceptionStatus.OPEN,
        priority,
        reason: 'Employee checked in while an approved leave exists.',
        remarks: 'Conflict automatically detected by system.',
        metadata: {
          history: [
            {
              event: 'Conflict Created',
              timestamp: new Date().toISOString(),
              remarks: `System detected check-in on approved leave date: ${date}`,
            },
          ],
        },
      } as any,
      { transaction },
    );

    // Generate unique reference ID: ACF-YYYY-000000
    const year = new Date(date).getFullYear();
    const conflictRef = `ACF-${year}-${String(conflict.id).padStart(6, '0')}`;
    conflict.conflictRef = conflictRef;
    await conflict.save({ transaction });

    // 5. Freeze attendance record by setting isConflict = true
    const record = await this.recordModel.findByPk(attendanceRecordId, { transaction });
    if (record) {
      record.isConflict = true;
      await record.save({ transaction });
    }

    // 6. Dispatch Notifications (Rule 8: prevent duplicates by ensuring single notification trigger here)
    await this.sendConflictNotifications(conflict, employeeId, companyId, date);

    return conflict;
  }

  /**
   * Action to move conflict status from OPEN -> UNDER_REVIEW (Rule 10)
   */
  async startReview(conflictId: number, userId: number): Promise<AttendanceException> {
    const conflict = await this.exceptionModel.findByPk(conflictId);
    if (!conflict) {
      throw new NotFoundException('Conflict exception not found');
    }

    // Rule 10: Only OPEN conflicts are editable
    if (conflict.status !== AttendanceExceptionStatus.OPEN) {
      throw new BadRequestException(`Cannot start review on a conflict that is ${conflict.status}`);
    }

    conflict.status = AttendanceExceptionStatus.UNDER_REVIEW;
    
    // Log timeline history
    const history = conflict.metadata?.history || [];
    history.push({
      event: 'Review Started',
      timestamp: new Date().toISOString(),
      performerId: userId,
    });
    conflict.metadata = { ...conflict.metadata, history };
    
    await conflict.save();
    return conflict;
  }

  /**
   * Resolve conflict transactionally (Rule 2)
   */
  async resolveConflict(
    conflictId: number,
    companyId: number,
    userId: number,
    dto: { resolution: string; remarks: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AttendanceException> {
    const t = await this.exceptionModel.sequelize.transaction();
    try {
      const conflict = await this.exceptionModel.findOne({
        where: { id: conflictId, companyId },
        include: [
          { model: LeaveRequest, as: 'leaveRequest' },
          { model: AttendanceRecord, as: 'attendanceRecordRef' },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!conflict) {
        throw new NotFoundException('Conflict exception not found');
      }

      // Rule 9, 10: Only OPEN/UNDER_REVIEW conflicts are editable/resolvable
      if (
        conflict.status === AttendanceExceptionStatus.RESOLVED ||
        conflict.status === AttendanceExceptionStatus.CANCELLED
      ) {
        throw new BadRequestException('Conflict is already resolved or cancelled');
      }

      const leave = conflict.leaveRequest;
      const record = conflict.attendanceRecordRef;
      const originalConflictStatus = conflict.status;
      const oldLeaveStatus = leave ? leave.status : null;
      const oldAttendanceStatus = record ? record.attendanceStatus : null;

      const history = conflict.metadata?.history || [];
      const year = record ? new Date(record.date).getFullYear() : new Date().getFullYear();

      let newLeaveStatus = oldLeaveStatus;
      let newAttendanceStatus = oldAttendanceStatus;

      // Option A: Convert Leave -> Present
      if (dto.resolution === 'CONVERT_PRESENT') {
        if (!leave) throw new BadRequestException('Leave request record is missing');
        
        // Cancel Leave (Rule 4: Leave is never hard deleted)
        leave.status = LeaveRequestStatus.CANCELLED;
        await leave.save({ transaction: t });
        newLeaveStatus = LeaveRequestStatus.CANCELLED;

        // Restore Leave Balance (Rule 5: tracks using balance history)
        const balance = await this.leaveBalanceModel.findOne({
          where: { employeeId: conflict.employeeId, leaveTypeId: leave.leaveTypeId, year },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (balance) {
          const balanceBefore = Number(balance.remainingDays);
          const refundAmount = Number(leave.totalDays);
          
          await balance.update(
            {
              usedDays: Math.max(0, Number(balance.usedDays) - refundAmount),
              remainingDays: balanceBefore + refundAmount,
            },
            { transaction: t },
          );

          await this.leaveBalanceHistoryModel.create(
            {
              employeeId: conflict.employeeId,
              leaveTypeId: leave.leaveTypeId,
              year,
              changeType: 'REFUND',
              changeDays: refundAmount,
              balanceBefore,
              balanceAfter: balanceBefore + refundAmount,
              reason: `Conflict Resolution (ACF): Converted Leave ${leave.id} to Present.`,
              changedBy: userId,
              leaveRequestId: leave.id,
            } as any,
            { transaction: t },
          );
        }

        // Attendance = Present / Calculated worked status
        if (record) {
          record.isConflict = false;
          record.isIgnored = false;
          // Set attendanceStatus back to Present or calculated value
          if (!record.attendanceStatus || record.attendanceStatus === AttendanceStatus.ON_LEAVE) {
            record.attendanceStatus = AttendanceStatus.PRESENT;
          }
          await record.save({ transaction: t });
          newAttendanceStatus = record.attendanceStatus;
        }

        conflict.status = AttendanceExceptionStatus.RESOLVED;
        history.push({
          event: 'Resolved: Convert Leave to Present',
          timestamp: new Date().toISOString(),
          performerId: userId,
          remarks: dto.remarks,
        });
      }
      
      // Option B: Convert Leave -> Half Day
      else if (dto.resolution === 'CONVERT_HALF_DAY') {
        if (!leave) throw new BadRequestException('Leave request record is missing');
        
        const originalTotalDays = Number(leave.totalDays);
        const daysToRefund = originalTotalDays - 0.5;

        // Convert Leave to Half Day
        leave.isHalfDay = true;
        leave.totalDays = 0.5;
        leave.halfDayType = leave.halfDayType || HalfDayType.FIRST_HALF;
        await leave.save({ transaction: t });

        // Refund the difference (if any) to Leave Balance
        if (daysToRefund > 0) {
          const balance = await this.leaveBalanceModel.findOne({
            where: { employeeId: conflict.employeeId, leaveTypeId: leave.leaveTypeId, year },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (balance) {
            const balanceBefore = Number(balance.remainingDays);
            await balance.update(
              {
                usedDays: Math.max(0, Number(balance.usedDays) - daysToRefund),
                remainingDays: balanceBefore + daysToRefund,
              },
              { transaction: t },
            );

            await this.leaveBalanceHistoryModel.create(
              {
                employeeId: conflict.employeeId,
                leaveTypeId: leave.leaveTypeId,
                year,
                changeType: 'REFUND',
                changeDays: daysToRefund,
                balanceBefore,
                balanceAfter: balanceBefore + daysToRefund,
                reason: `Conflict Resolution (ACF): Converted Leave ${leave.id} to Half Day.`,
                changedBy: userId,
                leaveRequestId: leave.id,
              } as any,
              { transaction: t },
            );
          }
        }

        // Attendance = Half Day
        if (record) {
          record.isConflict = false;
          record.isIgnored = false;
          record.attendanceStatus = AttendanceStatus.HALF_DAY;
          await record.save({ transaction: t });
          newAttendanceStatus = AttendanceStatus.HALF_DAY;
        }

        conflict.status = AttendanceExceptionStatus.RESOLVED;
        history.push({
          event: 'Resolved: Convert Leave to Half Day',
          timestamp: new Date().toISOString(),
          performerId: userId,
          remarks: dto.remarks,
        });
      }

      // Option C: Keep Approved Leave
      else if (dto.resolution === 'KEEP_LEAVE') {
        // Keep Leave Approved, Mark Attendance Ignored (Rule 3: timings intact but flagged ignored)
        if (record) {
          record.isConflict = false;
          record.isIgnored = true;
          // Set to PRESENT (preserving checkout history) but flagged isIgnored
          if (!record.attendanceStatus || record.attendanceStatus === AttendanceStatus.ON_LEAVE) {
            record.attendanceStatus = AttendanceStatus.PRESENT;
          }
          await record.save({ transaction: t });
          newAttendanceStatus = record.attendanceStatus;
        }

        conflict.status = AttendanceExceptionStatus.RESOLVED;
        history.push({
          event: 'Resolved: Keep Approved Leave (Attendance Ignored)',
          timestamp: new Date().toISOString(),
          performerId: userId,
          remarks: dto.remarks,
        });
      }

      // Option D: Send Back For Explanation
      else if (dto.resolution === 'SEND_BACK') {
        // Rule 3: Transitions status UNDER_REVIEW -> OPEN
        conflict.status = AttendanceExceptionStatus.OPEN;
        history.push({
          event: 'Review Action: Sent Back for Explanation',
          timestamp: new Date().toISOString(),
          performerId: userId,
          remarks: dto.remarks,
        });

        // Trigger notification to employee
        const employee = await this.employeeModel.findByPk(conflict.employeeId, { transaction: t });
        if (employee && employee.userId) {
          await this.notificationsService.createNotification({
            recipients: [employee.userId],
            type: NotificationType.HR,
            referenceType: 'attendance_conflict_explanation',
            referenceId: conflict.id,
            title: 'Explanation Required: Attendance Conflict',
            payload: {
              conflictId: conflict.id,
              conflictRef: conflict.conflictRef,
              date: record?.date,
              message: 'Your attendance conflicts with an approved leave. Please submit an explanation to HR.',
              url: '/attendance',
            },
          });
        }
      } else {
        throw new BadRequestException(`Invalid resolution option: ${dto.resolution}`);
      }

      // Save conflict changes
      conflict.resolution = dto.resolution;
      conflict.remarks = dto.remarks;
      conflict.resolvedBy = userId;
      conflict.resolvedAt = new Date();
      conflict.metadata = { ...conflict.metadata, history };
      await conflict.save({ transaction: t });

      // Rule 6: Write standard system audit logs (Rule 7: never lose history)
      await this.auditLogModel.create(
        {
          companyId,
          userId,
          entityType: 'AttendanceException',
          entityId: conflict.id,
          action: 'RESOLVE',
          oldValue: {
            status: originalConflictStatus,
            leaveStatus: oldLeaveStatus,
            attendanceStatus: oldAttendanceStatus,
          },
          newValue: {
            status: conflict.status,
            leaveStatus: newLeaveStatus,
            attendanceStatus: newAttendanceStatus,
            resolution: dto.resolution,
            remarks: dto.remarks,
          },
          ipAddress: ipAddress || '127.0.0.1',
          userAgent: userAgent || 'System/Cron',
        } as any,
        { transaction: t },
      );

      await t.commit();
      return conflict;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Helper to dispatch notifications. Rule 8 prevents duplicates by keeping it centralized here.
   */
  async sendConflictNotifications(
    conflict: AttendanceException,
    employeeId: number,
    companyId: number,
    dateStr: string,
  ): Promise<void> {
    try {
      const employee = await this.employeeModel.findByPk(employeeId, {
        include: [{ model: User, as: 'user', attributes: ['id'] }],
      });
      const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Employee';
      const employeeUserId = employee?.user?.id;

      // 1. Notify employee
      if (employeeUserId) {
        await this.notificationsService.createNotification({
          recipients: [employeeUserId],
          type: NotificationType.HR,
          referenceType: 'attendance_conflict',
          referenceId: conflict.id,
          title: 'Attendance Conflict Detected',
          payload: {
            conflictId: conflict.id,
            conflictRef: conflict.conflictRef,
            date: dateStr,
            message: 'Your attendance conflicts with an approved leave. HR review is pending.',
            url: '/attendance',
          },
        });
      }

      // 2. Notify HR/Admin users who hold override permissions
      const usersToNotify = await this.userModel.findAll({
        where: {
          isActive: true,
        },
        include: [
          {
            model: Role,
            required: false,
          },
          {
            model: UserCompany,
            required: false,
            include: [{ model: Role, as: 'role' }],
          },
        ],
      });

      const recipientIds = usersToNotify
        .filter((u) => {
          if (u.email === 'admin@agricom.com') return true;
          if (u.roles?.some((r) => ['Admin', 'Client Admin'].includes(r.name))) return true;
          if (u.userCompanies?.some((uc) => ['Admin', 'Client Admin'].includes(uc.role?.name))) return true;
          return false;
        })
        .map((u) => u.id);

      if (recipientIds.length > 0) {
        await this.notificationsService.createNotification({
          recipients: recipientIds,
          type: NotificationType.HR,
          referenceType: 'attendance_conflict',
          referenceId: conflict.id,
          title: 'Attendance Conflict Detected',
          payload: {
            conflictId: conflict.id,
            conflictRef: conflict.conflictRef,
            employeeName,
            date: dateStr,
            message: `Attendance conflict requires review: ${employeeName} on ${dateStr}.`,
            url: `/attendance`,
          },
        });
      }
    } catch (err) {
      console.error('[sendConflictNotifications] Error:', err);
    }
  }

  /**
   * Query all conflicts for the active company
   */
  async getConflicts(companyId: number): Promise<AttendanceException[]> {
    return this.exceptionModel.findAll({
      where: {
        companyId,
        exceptionType: 'LEAVE_CONFLICT',
      },
      include: [
        {
          model: Employee,
          as: 'employee',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        },
        { model: AttendanceRecord, as: 'attendanceRecordRef' },
        { model: LeaveRequest, as: 'leaveRequest' },
      ],
      order: [['createdAt', 'DESC']],
    });
  }
}
