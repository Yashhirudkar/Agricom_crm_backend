import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../models/leave-request.model';
import {
  LeaveApprovalStep,
  ApprovalStepStatus,
} from '../models/leave-approval-step.model';
import {
  LeaveApprovalLog,
  LeaveAction,
} from '../models/leave-approval-log.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import {
  ApproveLeaveDto,
  RejectLeaveDto,
  CancelLeaveDto,
} from '../dto/leave-requests.dto';
import {
  AttendanceRecord,
  AttendanceStatus,
} from '../../attendance/models/attendance-record.model';
import { AttendanceGateway } from '../../attendance/gateways/attendance.gateway';
import { AttendanceConflictService } from '../../attendance/services/attendance-conflict.service';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import { Employee } from '../models/employee.model';

/** Safely convert a Sequelize DATEONLY value (string "YYYY-MM-DD" or Date) to "YYYY-MM-DD" string. */
function toDateOnlyStr(value: Date | string | any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  return new Date(value).toISOString().split('T')[0];
}

/** Extract year from a Sequelize DATEONLY column safely without UTC offset distortion. */
function getYearFromDateOnly(value: Date | string | any): number {
  return parseInt(toDateOnlyStr(value).substring(0, 4), 10);
}

@Injectable()
export class LeaveRequestsWorkflowService {
  constructor(
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(LeaveApprovalStep)
    private readonly leaveApprovalStepModel: typeof LeaveApprovalStep,
    @InjectModel(LeaveApprovalLog)
    private readonly leaveApprovalLogModel: typeof LeaveApprovalLog,
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(AttendanceRecord)
    private readonly attendanceRecordModel: typeof AttendanceRecord,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly conflictService: AttendanceConflictService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async approveLeave(
    requestId: number,
    companyId: number,
    approverId: number,
    dto: ApproveLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    const t = await this.leaveRequestModel.sequelize.transaction();
    let affectedRecords: AttendanceRecord[] = [];
    try {
      const leaveRequest = await this.leaveRequestModel.findOne({
        where: { id: requestId, companyId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      if (
        leaveRequest.employeeId === approverId &&
        actor?.type !== 'super_admin'
      ) {
        throw new ForbiddenException(
          'You cannot approve your own leave request',
        );
      }

      if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
        throw new BadRequestException(
          `Cannot approve a leave request that is ${leaveRequest.status}`,
        );
      }

      const step = await this.leaveApprovalStepModel.findOne({
        where: {
          leaveRequestId: requestId,
          level: leaveRequest.currentApprovalLevel,
          status: ApprovalStepStatus.PENDING,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!step)
        throw new BadRequestException('No pending approval step found');

      if (
        step.approverId !== approverId &&
        actor?.type !== 'super_admin' &&
        actor?.type !== 'client_admin'
      ) {
        throw new ForbiddenException(
          'You are not the designated approver for this step',
        );
      }

      const year = getYearFromDateOnly(leaveRequest.fromDate);
      const balance = await this.employeeLeaveBalanceModel.findOne({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      await step.update(
        {
          status: ApprovalStepStatus.APPROVED,
          remarks: dto.remarks || null,
          approvedAt: new Date(),
        },
        { transaction: t },
      );

      if (
        leaveRequest.currentApprovalLevel >= leaveRequest.finalApprovalLevel
      ) {
        await leaveRequest.update(
          { status: LeaveRequestStatus.APPROVED },
          { transaction: t },
        );

        // Sync attendance records to ON_LEAVE or HALF_DAY immediately
        const fromDateStr = toDateOnlyStr(leaveRequest.fromDate);
        const toDateStr = toDateOnlyStr(leaveRequest.toDate);
        affectedRecords = await this.attendanceRecordModel.findAll({
          where: {
            employeeId: leaveRequest.employeeId,
            companyId,
            date: { [Op.between]: [fromDateStr, toDateStr] },
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        for (const record of affectedRecords) {
          if (record.isPayrollLocked) {
            throw new ForbiddenException(
              `Cannot approve leave because attendance for ${record.date} is already finalized/payroll locked.`,
            );
          }
          if (record.checkInTime) {
            // Employee checked in! This is a conflict!
            await record.update(
              { isConflict: true },
              { transaction: t },
            );
            await this.conflictService.checkAndCreateLeaveConflict(
              leaveRequest.employeeId,
              companyId,
              toDateOnlyStr(record.date),
              record.id,
              t,
            );
          } else {
            if (!leaveRequest.isHalfDay) {
              await record.update(
                { attendanceStatus: AttendanceStatus.ON_LEAVE },
                { transaction: t },
              );
            } else if (record.attendanceStatus === AttendanceStatus.ABSENT) {
              await record.update(
                { attendanceStatus: AttendanceStatus.HALF_DAY },
                { transaction: t },
              );
            }
          }
        }

        // Convert pending to used
        if (balance) {
          await balance.update(
            {
              pendingDays:
                Number(balance.pendingDays) - Number(leaveRequest.totalDays),
              usedDays:
                Number(balance.usedDays) + Number(leaveRequest.totalDays),
            },
            { transaction: t },
          );
        }
      } else {
        await leaveRequest.update(
          { currentApprovalLevel: leaveRequest.currentApprovalLevel + 1 },
          { transaction: t },
        );
      }

      await this.leaveApprovalLogModel.create(
        {
          leaveRequestId: leaveRequest.id,
          action: LeaveAction.APPROVED,
          performedBy: actor?.userId || null,
          remarks: dto.remarks || `Approved at level ${step.level}`,
        },
        { transaction: t },
      );

      await t.commit();

      // Trigger notification to employee on final approval
      if ((leaveRequest.status as any) === LeaveRequestStatus.APPROVED) {
        try {
          const emp = await this.employeeModel.findByPk(leaveRequest.employeeId);
          if (emp && emp.userId) {
            await this.notificationsService.createNotification({
              recipients: [emp.userId],
              type: NotificationType.HR,
              referenceType: 'leave_approved',
              referenceId: leaveRequest.id,
              title: '✅ Leave Approved',
              payload: {
                message: `Your leave request from ${toDateOnlyStr(leaveRequest.fromDate)} to ${toDateOnlyStr(leaveRequest.toDate)} has been approved.`,
                url: '/attendance/my-leaves',
              },
              category: 'LEAVE',
            });
          }
        } catch (notifErr) {
          console.error('[LeaveRequestsWorkflowService] Failed to send leave approval notification:', notifErr);
        }
      }

      // Emit updates
      if (affectedRecords && affectedRecords.length > 0) {
        for (const record of affectedRecords) {
          try {
            this.attendanceGateway.emitAttendanceUpdate(
              'leave_approved',
              record,
            );
          } catch (err) {
            console.error('Socket emit error in approveLeave:', err);
          }
        }
      }

      return { message: 'Leave request approved successfully' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async rejectLeave(
    requestId: number,
    companyId: number,
    approverId: number,
    dto: RejectLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    const t = await this.leaveRequestModel.sequelize.transaction();
    try {
      const leaveRequest = await this.leaveRequestModel.findOne({
        where: { id: requestId, companyId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      if (
        leaveRequest.employeeId === approverId &&
        actor?.type !== 'super_admin'
      ) {
        throw new ForbiddenException(
          'You cannot reject your own leave request',
        );
      }

      if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
        throw new BadRequestException(
          `Cannot reject a leave request that is ${leaveRequest.status}`,
        );
      }

      const step = await this.leaveApprovalStepModel.findOne({
        where: {
          leaveRequestId: requestId,
          level: leaveRequest.currentApprovalLevel,
          status: ApprovalStepStatus.PENDING,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!step)
        throw new BadRequestException('No pending approval step found');

      if (
        step.approverId !== approverId &&
        actor?.type !== 'super_admin' &&
        actor?.type !== 'client_admin'
      ) {
        throw new ForbiddenException(
          'You are not the designated approver for this step',
        );
      }

      const year = getYearFromDateOnly(leaveRequest.fromDate);
      const balance = await this.employeeLeaveBalanceModel.findOne({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      await step.update(
        {
          status: ApprovalStepStatus.REJECTED,
          remarks: dto.reason,
          approvedAt: new Date(),
        },
        { transaction: t },
      );

      await leaveRequest.update(
        {
          status: LeaveRequestStatus.REJECTED,
          rejectedReason: dto.reason,
        },
        { transaction: t },
      );

      // Revert pending days
      if (balance) {
        await balance.update(
          {
            pendingDays:
              Number(balance.pendingDays) - Number(leaveRequest.totalDays),
            remainingDays:
              Number(balance.remainingDays) + Number(leaveRequest.totalDays),
          },
          { transaction: t },
        );
      }

      await this.leaveApprovalLogModel.create(
        {
          leaveRequestId: leaveRequest.id,
          action: LeaveAction.REJECTED,
          performedBy: actor?.userId || null,
          remarks: dto.reason,
        },
        { transaction: t },
      );

      await t.commit();

      // Trigger notification to employee on rejection
      try {
        const emp = await this.employeeModel.findByPk(leaveRequest.employeeId);
        if (emp && emp.userId) {
          await this.notificationsService.createNotification({
            recipients: [emp.userId],
            type: NotificationType.HR,
            referenceType: 'leave_rejected',
            referenceId: leaveRequest.id,
            title: '❌ Leave Rejected',
            payload: {
              message: `Your leave request from ${toDateOnlyStr(leaveRequest.fromDate)} to ${toDateOnlyStr(leaveRequest.toDate)} has been rejected. Reason: ${dto.reason || 'None'}`,
              url: '/attendance/my-leaves',
            },
            category: 'LEAVE',
          });
        }
      } catch (notifErr) {
        console.error('[LeaveRequestsWorkflowService] Failed to send leave rejection notification:', notifErr);
      }

      return { message: 'Leave request rejected successfully' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async cancelLeave(
    requestId: number,
    companyId: number,
    employeeId: number,
    dto: CancelLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    const t = await this.leaveRequestModel.sequelize.transaction();
    let affectedRecords: AttendanceRecord[] = [];
    try {
      const leaveRequest = await this.leaveRequestModel.findOne({
        where: { id: requestId, companyId, employeeId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      if (
        leaveRequest.status === LeaveRequestStatus.REJECTED ||
        leaveRequest.status === LeaveRequestStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `Leave request is already ${leaveRequest.status}`,
        );
      }

      const year = getYearFromDateOnly(leaveRequest.fromDate);
      const balance = await this.employeeLeaveBalanceModel.findOne({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const oldStatus = leaveRequest.status;
      await leaveRequest.update(
        {
          status: LeaveRequestStatus.CANCELLED,
        },
        { transaction: t },
      );

      // Rollback attendance records that were set to ON_LEAVE during approval
      if (oldStatus === LeaveRequestStatus.APPROVED) {
        const fromDateStr = toDateOnlyStr(leaveRequest.fromDate);
        const toDateStr = toDateOnlyStr(leaveRequest.toDate);
        affectedRecords = await this.attendanceRecordModel.findAll({
          where: {
            employeeId: leaveRequest.employeeId,
            companyId,
            date: { [Op.between]: [fromDateStr, toDateStr] },
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        for (const record of affectedRecords) {
          // Hard payroll lock: cannot mutate finalized records
          if (record.isPayrollLocked) {
            throw new ForbiddenException(
              `Cannot cancel leave: attendance for ${record.date} is already payroll-locked.`,
            );
          }

          if (!record.checkInTime) {
            // Case 1: Employee never checked in — DELETE placeholder entirely.
            // The dynamic engine (cron / monthly report) will re-evaluate as
            // HOLIDAY, WEEK_OFF, or ABSENT when the day ends.
            await record.destroy({ transaction: t });
          } else {
            // Case 2: Employee already checked in (or is actively WORKING).
            // Reset status to null so checkout calculates the real final status.
            // Do NOT force ABSENT — they may still check out later today.
            await record.update({ attendanceStatus: null }, { transaction: t });
          }
        }
      }

      if (balance) {
        if (oldStatus === LeaveRequestStatus.PENDING) {
          await balance.update(
            {
              pendingDays:
                Number(balance.pendingDays) - Number(leaveRequest.totalDays),
              remainingDays:
                Number(balance.remainingDays) + Number(leaveRequest.totalDays),
            },
            { transaction: t },
          );
        } else if (oldStatus === LeaveRequestStatus.APPROVED) {
          await balance.update(
            {
              usedDays:
                Number(balance.usedDays) - Number(leaveRequest.totalDays),
              remainingDays:
                Number(balance.remainingDays) + Number(leaveRequest.totalDays),
            },
            { transaction: t },
          );
        }
      }

      await this.leaveApprovalLogModel.create(
        {
          leaveRequestId: leaveRequest.id,
          action: LeaveAction.CANCELLED,
          performedBy: actor?.userId || null,
          remarks: dto.reason || 'Cancelled by employee',
        },
        { transaction: t },
      );

      await t.commit();

      // Trigger notification on cancellation
      try {
        const emp = await this.employeeModel.findByPk(leaveRequest.employeeId);
        if (emp) {
          const recipients = new Set<number>();
          if (emp.userId) recipients.add(emp.userId);

          // Add manager
          if (emp.managerId) {
            const manager = await this.employeeModel.findByPk(emp.managerId);
            if (manager && manager.userId) {
              recipients.add(manager.userId);
            }
          }

          // Add users holding leave:approve permission (HR & Admins)
          try {
            const resourceActions = await this.employeeModel.sequelize.models.ResourceAction.findAll({
              include: [{
                model: this.employeeModel.sequelize.models.ModuleResource,
                required: true,
                as: 'resource'
              }]
            });

            const allowedActionIds = resourceActions
              .filter((ra: any) => {
                const resourceName = ra.resource?.name;
                const actionName = ra.name?.toLowerCase();
                if (!resourceName || !actionName) return false;
                
                let res = resourceName;
                let act = actionName;
                if (res === 'manager' && act === 'approve_leave') {
                  res = 'leave';
                  act = 'approve';
                }
                return `${res}:${act}` === 'leave:approve';
              })
              .map((ra: any) => ra.id);

            if (allowedActionIds.length > 0) {
              const rolePermissions = await this.employeeModel.sequelize.models.RoleActionPermission.findAll({
                where: { resource_action_id: allowedActionIds },
                attributes: ['role_id'],
              });
              const roleIds = rolePermissions.map((rp: any) => rp.role_id);

              if (roleIds.length > 0) {
                const companyMemberships = await this.employeeModel.sequelize.models.UserCompany.findAll({
                  where: {
                    companyId,
                    roleId: roleIds,
                    status: 'Active',
                  },
                  attributes: ['userId'],
                });
                companyMemberships.forEach((m: any) => recipients.add(m.userId));

                const globalUserRoles = await this.employeeModel.sequelize.models.UserRole.findAll({
                  where: { roleId: roleIds },
                  attributes: ['userId'],
                });
                
                const globalUserIds = globalUserRoles.map((ur: any) => ur.userId);
                if (globalUserIds.length > 0) {
                  const companyProfile = await this.employeeModel.sequelize.models.Company.findByPk(emp.companyId);
                  const clientId = companyProfile ? (companyProfile as any).clientId : null;
                  if (clientId) {
                    const activeClientAdmins = await this.employeeModel.sequelize.models.User.findAll({
                      where: {
                        id: globalUserIds,
                        clientId,
                        isActive: true,
                      },
                      attributes: ['id'],
                    });
                    activeClientAdmins.forEach((u: any) => recipients.add((u as any).id));
                  }
                }
              }
            }
          } catch (permErr) {
            console.error('[LeaveRequestsWorkflowService] Error query leave:approve users for cancel notification:', permErr);
          }

          // Always add default super admin
          const superAdmin = await this.employeeModel.sequelize.models.User.findOne({
            where: { email: 'admin@agricom.com', isActive: true },
            attributes: ['id'],
          });
          if (superAdmin) {
            recipients.add((superAdmin as any).id);
          }

          await this.notificationsService.createNotification({
            recipients: Array.from(recipients).filter(Boolean),
            type: NotificationType.HR,
            referenceType: 'leave_cancelled',
            referenceId: leaveRequest.id,
            title: '📄 Leave Cancelled',
            payload: {
              message: `Leave request for ${emp.firstName} ${emp.lastName} from ${toDateOnlyStr(leaveRequest.fromDate)} to ${toDateOnlyStr(leaveRequest.toDate)} has been cancelled.`,
              url: '/attendance/leave-approvals',
            },
            category: 'LEAVE',
          });
        }
      } catch (notifErr) {
        console.error('[LeaveRequestsWorkflowService] Failed to send leave cancellation notification:', notifErr);
      }

      // Emit updates
      if (affectedRecords && affectedRecords.length > 0) {
        for (const record of affectedRecords) {
          try {
            this.attendanceGateway.emitAttendanceUpdate(
              'leave_cancelled',
              record,
            );
          } catch (err) {
            console.error('Socket emit error in cancelLeave:', err);
          }
        }
      }

      return { message: 'Leave request cancelled successfully' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
