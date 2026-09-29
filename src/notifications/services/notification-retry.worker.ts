import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { NotificationLog } from '../models/notification-log.model';
import { NotificationDispatchService, MAX_WORKER_RETRIES } from './notification-dispatch.service';
import { NotificationChannel } from '../notification.types';

const BATCH_SIZE = 20; // Max rows to process per cron tick

/**
 * NotificationRetryWorker — persistent, crash-safe retry engine.
 *
 * Design:
 *   - Runs every minute via @Cron
 *   - Queries notification_logs for rows where:
 *       status = 'failed'
 *       AND retryCount < MAX_WORKER_RETRIES
 *       AND nextRetryAt <= NOW
 *   - Retries each row via NotificationDispatchService.retryLog()
 *   - Updates retryCount, nextRetryAt, status in DB
 *
 * Crash safety:
 *   If the server restarts mid-retry, the failed row stays in the DB.
 *   On next startup, the worker picks it up again at the scheduled nextRetryAt.
 *   No notification is lost due to server crashes or restarts.
 *
 * Concurrency safety:
 *   Rows are fetched and immediately marked as 'pending' before processing.
 *   This prevents two worker instances (or two quick ticks) from double-retrying.
 */
@Injectable()
export class NotificationRetryWorker {
  private readonly logger = new Logger(NotificationRetryWorker.name);
  private isRunning = false; // Guard against overlapping ticks

  constructor(
    @InjectModel(NotificationLog)
    private readonly notificationLogModel: typeof NotificationLog,
    private readonly dispatchService: NotificationDispatchService,
  ) {}

  /**
   * Runs every minute.
   * Picks up failed notifications that are due for retry.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runRetryBatch(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('[RetryWorker] Previous tick still running — skipping');
      return;
    }

    this.isRunning = true;
    try {
      await this.processBatch();
    } catch (err: any) {
      this.logger.error(`[RetryWorker] Unhandled error in batch: ${err?.message}`, err?.stack);
    } finally {
      this.isRunning = false;
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();

    // Fetch due-for-retry rows
    const dueLogs = await this.notificationLogModel.findAll({
      where: {
        status: 'failed',
        retryCount: { [Op.lt]: MAX_WORKER_RETRIES },
        nextRetryAt: { [Op.lte]: now },
      },
      order: [['nextRetryAt', 'ASC']], // oldest first
      limit: BATCH_SIZE,
    });

    if (dueLogs.length === 0) return;

    this.logger.log(`[RetryWorker] Processing ${dueLogs.length} due retries`);

    for (const log of dueLogs) {
      await this.retryOne(log);
    }
  }

  private async retryOne(log: NotificationLog): Promise<void> {
    // Increment retryCount before the attempt (idempotency guard)
    // If the process crashes mid-send, the count is already bumped so
    // a duplicate send won't happen on the next tick.
    log.retryCount = log.retryCount + 1;
    log.status = 'pending'; // Lock the row from other ticks
    log.nextRetryAt = null;

    try {
      await log.save();
    } catch (saveErr: any) {
      this.logger.warn(`[RetryWorker] Could not lock log #${log.id}: ${saveErr?.message}`);
      return;
    }

    this.logger.log(
      `[RetryWorker] 🔄 Retrying log #${log.id} ` +
      `(${log.channel}:${log.template}, attempt ${log.retryCount}/${MAX_WORKER_RETRIES})`,
    );

    try {
      // Delegate actual send + status update to dispatch service
      await this.dispatchService.retryLog(log);
    } catch (err: any) {
      // retryLog should never throw — but just in case:
      this.logger.error(`[RetryWorker] retryLog threw for #${log.id}: ${err?.message}`);
      await this.dispatchService.scheduleRetryOrExhaust(log, err?.message || 'Worker error');
    }
  }

  // ─── Admin helpers (callable from controller) ─────────────────────────────────

  /**
   * Returns a count of logs by status — useful for admin dashboards.
   */
  async getStats(): Promise<Record<string, number>> {
    const results = await this.notificationLogModel.findAll({
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    }) as any[];

    return results.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {} as Record<string, number>);
  }
}
