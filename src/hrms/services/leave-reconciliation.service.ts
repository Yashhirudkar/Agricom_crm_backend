import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../models/leave-request.model';
import { LeaveRevalidationService } from './leave-revalidation.service';

@Injectable()
export class LeaveReconciliationService {
  private readonly logger = new Logger(LeaveReconciliationService.name);

  constructor(
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    private readonly leaveRevalidationService: LeaveRevalidationService,
  ) {}

  /**
   * Daily reconciliation job at 2:00 AM.
   * Safety net for missed events, server restarts, or direct DB imports.
   */
  @Cron('0 2 * * *')
  async runDailyReconciliation() {
    this.logger.log('Starting daily leave reconciliation check...');
    try {
      const stats = await this.reconcileActiveLeaves();
      this.logger.log(
        `Daily reconciliation complete: ${stats.inspected} inspected, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`,
      );
    } catch (err) {
      this.logger.error('Daily leave reconciliation error:', err);
    }
  }

  /**
   * Reconciles all future/active PENDING and APPROVED leave requests.
   * Idempotent: only updates if calculated days differ from stored days.
   */
  async reconcileActiveLeaves(
    companyId?: number,
  ): Promise<{ inspected: number; updated: number; skipped: number; errors: number }> {
    const todayStr = new Date().toISOString().split('T')[0];

    const where: any = {
      status: {
        [Op.in]: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED],
      },
      toDate: { [Op.gte]: todayStr },
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const activeLeaves = await this.leaveRequestModel.findAll({
      where,
      attributes: ['id'],
      order: [['id', 'ASC']],
    });

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const leave of activeLeaves) {
      const res = await this.leaveRevalidationService.recalculateSingleLeave(
        leave.id,
        null,
        undefined,
        undefined,
        'Daily Reconciliation',
      );

      if (res.status === 'UPDATED') updated++;
      else if (res.status === 'SKIPPED') skipped++;
      else errors++;
    }

    return {
      inspected: activeLeaves.length,
      updated,
      skipped,
      errors,
    };
  }
}
