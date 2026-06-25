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
    private readonly attendanceGateway: AttendanceGateway,
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
