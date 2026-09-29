import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { NotificationLog } from '../models/notification-log.model';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppTemplates } from '../whatsapp/whatsapp.templates';
import {
  NotificationChannel,
  NotificationTemplate,
  NotificationRecipient,
  NotificationSendOptions,
} from '../notification.types';
import { Company } from '../../companies/models/company.model';

/** Minutes to wait before the worker retries a failed send */
const RETRY_DELAYS_MINUTES = [2, 5]; // attempt 1 after 2min, attempt 2 after 5min
export const MAX_WORKER_RETRIES = RETRY_DELAYS_MINUTES.length;

/**
 * NotificationDispatchService — single entry point for all outbound notifications.
 *
 * Responsibilities (this service):
 *   1. Resolve symbolic recipient → actual JID / email
 *   2. Build the message string from the template + payload
 *   3. Create a NotificationLog row (status: pending)
 *   4. Make ONE send attempt
 *   5. Update the log: success / failed + nextRetryAt
 *
 * Retry responsibility → NotificationRetryWorker (separate class, DB-driven).
 * If the server restarts between attempts, the worker picks up failed rows from DB.
 *
 * Adding a new notification type:
 *   1. Add to NotificationTemplate enum (notification.types.ts)
 *   2. Add template builder (WhatsAppTemplates.xxx)
 *   3. Add case in buildMessage() below
 *   4. Call send() from the feature service — done, nothing else changes
 *
 * Adding a new channel (Email, SMS):
 *   1. Add service + inject here
 *   2. Add case in executeChannel()
 *   3. Feature service just passes channel: NotificationChannel.EMAIL
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    @InjectModel(NotificationLog)
    private readonly notificationLogModel: typeof NotificationLog,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Fire-and-forget — callers should NOT await this.
   *
   * Usage:
   * ```ts
   * this.notificationDispatchService
   *   .send({ channel, template, recipient, entityType, entityId, payload })
   *   .catch(err => this.logger.error(...));
   * ```
   */
  async send(options: NotificationSendOptions): Promise<void> {
    const { channel, template, recipient, entityType, entityId, payload, companyId } = options;

    // 1. Resolve actual JID / email from symbolic recipient name
    const resolution = await this.resolveRecipient(channel, recipient, companyId);

    if (resolution.disabled) {
      // Intentionally disabled, silently ignore to avoid spamming logs
      return;
    }

    if (!resolution.recipient) {
      this.logger.warn(
        `[Dispatch] No recipient resolved for ${channel}:${template} — ` +
        `companyId=${companyId} has WhatsApp enabled but Group Name/ID is missing or invalid.`,
      );
      return;
    }

    const resolvedRecipient = resolution.recipient;

    // 2. Build message
    const message = this.buildMessage(channel, template, payload);
    if (!message) {
      this.logger.warn(`[Dispatch] No template handler for ${channel}:${template}`);
      return;
    }

    // 3. Persist log row (status: pending)
    const log = await this.createLog({
      entityType,
      entityId: entityId !== undefined ? String(entityId) : undefined,
      template,
      channel,
      recipient: resolvedRecipient,
      payload,
    });

    // 4. Single send attempt
    await this.attemptSend(log, channel, resolvedRecipient, message);
  }

  // ─── Called by NotificationRetryWorker ───────────────────────────────────────

  /**
   * Retry a previously failed log row.
   * Called by NotificationRetryWorker — not by feature services.
   */
  async retryLog(log: NotificationLog): Promise<void> {
    const message = this.buildMessage(
      log.channel as NotificationChannel,
      log.template as NotificationTemplate,
      log.payload as Record<string, any>,
    );

    if (!message) {
      this.logger.warn(`[Dispatch] Cannot retry — no template for ${log.channel}:${log.template}`);
      await this.markExhausted(log, 'No template handler found during retry');
      return;
    }

    await this.attemptSend(log, log.channel as NotificationChannel, log.recipient, message);
  }

  // ─── Recipient Resolution ─────────────────────────────────────────────────────

  /**
   * Maps symbolic NotificationRecipient names to actual JIDs/emails.
   */
  private async resolveRecipient(
    channel: NotificationChannel,
    recipient?: NotificationRecipient | string,
    companyId?: number,
  ): Promise<{ recipient: string | null; disabled: boolean }> {
    if (channel === NotificationChannel.WHATSAPP) {
      if (!companyId) {
        this.logger.warn(`[Dispatch] Cannot resolve WhatsApp recipient without companyId`);
        return { recipient: null, disabled: false };
      }

      const company = await this.companyModel.findByPk(companyId);
      if (!company) {
        this.logger.warn(`[Dispatch] Company ${companyId} not found`);
        return { recipient: null, disabled: false };
      }

      if (!company.whatsappEnabled) {
        // Intentionally disabled by the tenant
        return { recipient: null, disabled: true };
      }

      // Priority 1: Exact Group ID
      if (company.whatsappGroupId) {
        return { recipient: company.whatsappGroupId, disabled: false };
      }

      // Priority 2: Resolve by Group Name
      if (company.whatsappGroupName) {
        const jid = await this.whatsAppService.resolveGroupJidByName(company.whatsappGroupName);
        if (jid) {
          // Auto-cache the resolved JID
          company.whatsappGroupId = jid;
          company.whatsappConnectedAt = new Date();
          await company.save();
          this.logger.log(`[Dispatch] Auto-cached resolved WhatsApp Group JID for company ${companyId}`);
          return { recipient: jid, disabled: false };
        }
      }

      // Priority 3: Fallback to global config (backward compatibility)
      return { recipient: this.whatsAppService.getResolvedGroupJid(), disabled: false };
    }
    return { recipient: null, disabled: false };
  }

  // ─── Template Builder ──────────────────────────────────────────────────────────

  private buildMessage(
    channel: NotificationChannel,
    template: NotificationTemplate,
    payload: Record<string, any>,
  ): string | null {
    if (channel === NotificationChannel.WHATSAPP) {
      switch (template) {
        case NotificationTemplate.NEW_ENQUIRY:
          return WhatsAppTemplates.enquiryCreated(payload as any);

        case NotificationTemplate.TEST_MESSAGE:
          return WhatsAppTemplates.testMessage(payload as any);

        // ── Future templates ─────────────────────────────────────────────
        // case NotificationTemplate.NEW_QUOTATION:
        //   return WhatsAppTemplates.quotationCreated(payload as any);
        // case NotificationTemplate.NEW_SHIPMENT:
        //   return WhatsAppTemplates.shipmentBooked(payload as any);
        // case NotificationTemplate.PAYMENT_RECEIVED:
        //   return WhatsAppTemplates.paymentReceived(payload as any);

        default:
          return null;
      }
    }
    // Future: if (channel === EMAIL) { ... }
    return null;
  }

  // ─── Send + Log ────────────────────────────────────────────────────────────────

  private async attemptSend(
    log: NotificationLog,
    channel: NotificationChannel,
    recipient: string,
    message: string,
  ): Promise<void> {
    try {
      const success = await this.executeChannel(channel, recipient, message);

      if (success) {
        log.status = 'success';
        log.sentAt = new Date();
        log.retryCount = log.retryCount; // unchanged
        log.nextRetryAt = null;
        await log.save();
        this.logger.log(
          `[Dispatch] ✅ ${channel}:${log.template} → ${recipient} ` +
          `(retryCount=${log.retryCount})`,
        );
      } else {
        await this.scheduleRetryOrExhaust(log, 'Channel returned false (not connected)');
      }
    } catch (err: any) {
      await this.scheduleRetryOrExhaust(log, err?.message || 'Unknown error');
    }
  }

  /**
   * If retries remain, mark as failed + set nextRetryAt.
   * Otherwise mark as exhausted.
   */
  async scheduleRetryOrExhaust(log: NotificationLog, errorMessage: string): Promise<void> {
    const retryIndex = log.retryCount; // 0-based index into RETRY_DELAYS_MINUTES
    const hasMoreRetries = retryIndex < MAX_WORKER_RETRIES;

    if (hasMoreRetries) {
      const delayMinutes = RETRY_DELAYS_MINUTES[retryIndex];
      const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      log.status = 'failed';
      log.errorMessage = errorMessage;
      log.nextRetryAt = nextRetryAt;
      await log.save();
      this.logger.warn(
        `[Dispatch] ⚠️ ${log.channel}:${log.template} failed — ` +
        `retry ${retryIndex + 1}/${MAX_WORKER_RETRIES} scheduled in ${delayMinutes}min`,
      );
    } else {
      await this.markExhausted(log, errorMessage);
    }
  }

  private async markExhausted(log: NotificationLog, errorMessage: string): Promise<void> {
    log.status = 'exhausted';
    log.errorMessage = errorMessage;
    log.nextRetryAt = null;
    try {
      await log.save();
    } catch (saveErr: any) {
      this.logger.error(`[Dispatch] Failed to save exhausted log: ${saveErr?.message}`);
    }
    this.logger.error(
      `[Dispatch] ❌ ${log.channel}:${log.template} exhausted after ` +
      `${MAX_WORKER_RETRIES} retries. Last error: ${errorMessage}`,
    );
  }

  private async createLog(data: {
    entityType?: string;
    entityId?: string;
    template: string;
    channel: string;
    recipient: string;
    payload: Record<string, any>;
  }): Promise<NotificationLog> {
    try {
      return await this.notificationLogModel.create({
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        template: data.template,
        channel: data.channel,
        recipient: data.recipient,
        status: 'pending',
        retryCount: 0,
        payload: data.payload,
      });
    } catch (err: any) {
      this.logger.error(`[Dispatch] Failed to create log row: ${err?.message}`);
      // Return a detached mock so we can still attempt the send
      return this.notificationLogModel.build({
        template: data.template,
        channel: data.channel,
        recipient: data.recipient,
        status: 'pending',
        retryCount: 0,
        payload: data.payload,
      });
    }
  }

  private async executeChannel(
    channel: NotificationChannel,
    recipient: string,
    message: string,
  ): Promise<boolean> {
    switch (channel) {
      case NotificationChannel.WHATSAPP:
        return this.whatsAppService.sendText(recipient, message);
      // Future: case NotificationChannel.EMAIL: return this.emailService.send(...);
      default:
        return false;
    }
  }
}
