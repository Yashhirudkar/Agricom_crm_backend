import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../models/leave-request.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import {
  LeaveApprovalLog,
  LeaveAction,
} from '../models/leave-approval-log.model';
import { Company } from '../../companies/models/company.model';
import { LeaveCalculationService } from './leave-calculation.service';

export interface HolidayChangedEvent {
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  clientId: number;
  affectedDates: string[];
  affectedCompanyIds: number[] | null;
  triggeredBy: number | null;
  holidayId?: number;
  holidayTitle?: string;
}

/** Safely convert a Sequelize DATEONLY value to "YYYY-MM-DD" string */
function toDateOnlyStr(value: Date | string | any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  return new Date(value).toISOString().split('T')[0];
}

/** Extract year from a Sequelize DATEONLY column safely */
function getYearFromDateOnly(value: Date | string | any): number {
  return parseInt(toDateOnlyStr(value).substring(0, 4), 10);
}

@Injectable()
export class LeaveRevalidationService {
  private readonly logger = new Logger(LeaveRevalidationService.name);

  constructor(
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(LeaveApprovalLog)
    private readonly leaveApprovalLogModel: typeof LeaveApprovalLog,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    private readonly leaveCalculationService: LeaveCalculationService,
  ) {}

  /**
   * Event listener for holiday changes.
   * Runs only after the holiday transaction has successfully committed.
   */
  @OnEvent('holiday.changed', { async: true })
  async handleHolidayChanged(event: HolidayChangedEvent): Promise<void> {
    this.logger.log(
      `Received holiday.changed event: ${event.action} for dates [${event.affectedDates.join(', ')}] on client ${event.clientId}`,
    );

    try {
      await this.revalidateAffectedLeaves(event);
    } catch (err) {
      this.logger.error(
        `Failed to process holiday.changed event for client ${event.clientId}: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Core revalidation logic: finds and recalculates affected future/active leaves atomically.
   */
  async revalidateAffectedLeaves(event: HolidayChangedEvent): Promise<{
    inspected: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    if (!event.affectedDates || event.affectedDates.length === 0) {
      return { inspected: 0, updated: 0, skipped: 0, errors: 0 };
    }

    const sortedDates = [...event.affectedDates].sort();
    const minAffectedDate = sortedDates[0];
    const maxAffectedDate = sortedDates[sortedDates.length - 1];
    const todayStr = new Date().toISOString().split('T')[0];

    // Determine candidate companies
    let targetCompanyIds: number[] = [];
    if (event.affectedCompanyIds && event.affectedCompanyIds.length > 0) {
      targetCompanyIds = event.affectedCompanyIds;
    } else {
      // Client-wide scope: fetch all companies under this client
      const clientCompanies = await this.companyModel.findAll({
        where: { clientId: event.clientId, isActive: true },
        attributes: ['id'],
      });
      targetCompanyIds = clientCompanies.map((c) => c.id);
    }

    if (targetCompanyIds.length === 0) {
      this.logger.log('No matching companies found for holiday scope.');
      return { inspected: 0, updated: 0, skipped: 0, errors: 0 };
    }

    // Query affected future/active leaves
    const affectedLeaves = await this.leaveRequestModel.findAll({
      where: {
        companyId: { [Op.in]: targetCompanyIds },
        status: {
          [Op.in]: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED],
        },
        fromDate: { [Op.lte]: maxAffectedDate },
        toDate: {
          [Op.gte]: minAffectedDate > todayStr ? minAffectedDate : todayStr,
        },
      },
      attributes: [
        'id',
        'employeeId',
        'companyId',
        'leaveTypeId',
        'fromDate',
        'toDate',
        'totalDays',
        'status',
        'isHalfDay',
      ],
      order: [['id', 'ASC']],
    });

    this.logger.log(
      `Found ${affectedLeaves.length} candidate leave request(s) overlapping dates ${minAffectedDate} to ${maxAffectedDate}`,
    );

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const candidate of affectedLeaves) {
      const result = await this.recalculateSingleLeave(
        candidate.id,
        event.triggeredBy,
        event.holidayId,
        event.holidayTitle,
        event.action,
      );

      if (result.status === 'UPDATED') {
        updatedCount++;
      } else if (result.status === 'SKIPPED') {
        skippedCount++;
      } else {
        errorCount++;
      }
    }

    this.logger.log(
      `Revalidation complete: ${affectedLeaves.length} inspected, ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`,
    );

    return {
      inspected: affectedLeaves.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
    };
  }

  /**
   * Recalculates a single leave request in its own atomic transaction with row locking.
   */
  async recalculateSingleLeave(
    leaveRequestId: number,
    triggeredByUserId: number | null,
    holidayId?: number,
    holidayTitle?: string,
    actionType?: string,
  ): Promise<{ status: 'UPDATED' | 'SKIPPED' | 'ERROR'; message?: string }> {
    const t = await this.leaveRequestModel.sequelize.transaction();
    try {
      // 1. Lock leave request row FOR UPDATE
      const leaveRequest = await this.leaveRequestModel.findOne({
        where: { id: leaveRequestId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!leaveRequest) {
        await t.rollback();
        return { status: 'SKIPPED', message: 'Leave request not found' };
      }

      // Only revalidate PENDING or APPROVED
      if (
        leaveRequest.status !== LeaveRequestStatus.PENDING &&
        leaveRequest.status !== LeaveRequestStatus.APPROVED
      ) {
        await t.rollback();
        return {
          status: 'SKIPPED',
          message: `Leave status ${leaveRequest.status} not eligible`,
        };
      }

      const fromDateStr = toDateOnlyStr(leaveRequest.fromDate);
      const toDateStr = toDateOnlyStr(leaveRequest.toDate);
      const year = getYearFromDateOnly(leaveRequest.fromDate);

      // 2. Lock employee leave balance row FOR UPDATE
      const balance = await this.employeeLeaveBalanceModel.findOne({
        where: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      // 3. Authoritative recalculation
      const oldTotalDays = Number(leaveRequest.totalDays);
      const newTotalDays =
        await this.leaveCalculationService.calculateActualLeaveDays({
          fromDate: fromDateStr,
          toDate: toDateStr,
          companyId: leaveRequest.companyId,
          employeeId: leaveRequest.employeeId,
          isHalfDay: leaveRequest.isHalfDay,
        });

      const difference = newTotalDays - oldTotalDays;

      // 4. Idempotency check: if difference is 0, do nothing
      if (difference === 0) {
        await t.rollback();
        return {
          status: 'SKIPPED',
          message: `No change in totalDays (${oldTotalDays} === ${newTotalDays})`,
        };
      }

      // 5. Update leave request totalDays
      await leaveRequest.update(
        { totalDays: newTotalDays },
        { transaction: t },
      );

      // 6. Balance adjustment
      if (balance) {
        if (leaveRequest.status === LeaveRequestStatus.APPROVED) {
          const newUsed = Number(balance.usedDays) + difference;
          const newRemaining = Number(balance.remainingDays) - difference;

          // Strict validation: do not silently corrupt or force negative
          if (newUsed < 0 || newRemaining < 0) {
            throw new Error(
              `Invalid resulting balance for approved leave: usedDays=${newUsed}, remainingDays=${newRemaining}`,
            );
          }

          await balance.update(
            {
              usedDays: newUsed,
              remainingDays: newRemaining,
            },
            { transaction: t },
          );
        } else if (leaveRequest.status === LeaveRequestStatus.PENDING) {
          const newPending = Number(balance.pendingDays) + difference;
          const newRemaining = Number(balance.remainingDays) - difference;

          if (newPending < 0 || newRemaining < 0) {
            throw new Error(
              `Invalid resulting balance for pending leave: pendingDays=${newPending}, remainingDays=${newRemaining}`,
            );
          }

          await balance.update(
            {
              pendingDays: newPending,
              remainingDays: newRemaining,
            },
            { transaction: t },
          );
        }
      }

      // 7. Audit log insertion
      const diffSign = difference > 0 ? `+${difference}` : `${difference}`;
      const holidayInfo = holidayId
        ? `Holiday ID: ${holidayId}${holidayTitle ? ` (${holidayTitle})` : ''}`
        : 'Holiday calendar update';
      const actorInfo = triggeredByUserId
        ? ` Triggered by userId=${triggeredByUserId}.`
        : '';

      await this.leaveApprovalLogModel.create(
        {
          leaveRequestId: leaveRequest.id,
          action: LeaveAction.RECALCULATED,
          performedBy: triggeredByUserId || null,
          remarks: `Auto-recalculated: ${oldTotalDays} → ${newTotalDays} days (diff: ${diffSign}). Reason: ${actionType || 'Holiday change'}. ${holidayInfo}.${actorInfo}`,
        },
        { transaction: t },
      );

      await t.commit();
      this.logger.log(
        `Recalculated leave request #${leaveRequestId} (Emp #${leaveRequest.employeeId}): ${oldTotalDays} → ${newTotalDays} days (diff: ${diffSign})`,
      );

      return { status: 'UPDATED' };
    } catch (err) {
      await t.rollback();
      this.logger.error(
        `Failed to recalculate leave request #${leaveRequestId}: ${err.message}`,
        err.stack,
      );
      return { status: 'ERROR', message: err.message };
    }
  }
}
