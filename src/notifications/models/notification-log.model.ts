import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt,
  Index,
} from 'sequelize-typescript';

/**
 * Status state machine:
 *   pending   → first send in progress (or just created before first attempt)
 *   success   → delivered successfully
 *   failed    → last attempt failed; worker will retry if retryCount < MAX_WORKER_RETRIES
 *   exhausted → all retries used, no further attempts will be made
 */
export type NotificationLogStatus = 'pending' | 'success' | 'failed' | 'exhausted';

/**
 * Persistent log of every notification dispatch attempt.
 *
 * Doubles as the persistent retry queue:
 *   - Dispatch service creates a row (pending → attempt → success/failed)
 *   - NotificationRetryWorker polls for failed rows where nextRetryAt <= NOW
 *   - Worker retries and updates status until success or exhausted
 *
 * Fields allow full debugging of any notification failure without needing logs.
 */
@Table({
  tableName: 'notification_logs',
  timestamps: true,
})
export class NotificationLog extends Model<NotificationLog> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  // ─── Entity context ─────────────────────────────────────────────────────────

  /** Business entity type that triggered this notification, e.g. 'Enquiry', 'Quotation' */
  @AllowNull(true)
  @Column({ field: 'entity_type', type: DataType.STRING(50) })
  declare entityType: string;

  /** ID of the triggering entity (UUID or integer as string) */
  @AllowNull(true)
  @Column({ field: 'entity_id', type: DataType.STRING(100) })
  declare entityId: string;

  // ─── Classification ──────────────────────────────────────────────────────────

  /** Template used, e.g. 'NEW_ENQUIRY', 'NEW_QUOTATION' */
  @Index('notif_logs_channel_template_idx')
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare template: string;

  /** Channel used, e.g. 'whatsapp', 'email', 'sms' */
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare channel: string;

  /** Resolved destination: group JID, email, phone number */
  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare recipient: string;

  // ─── Delivery state ──────────────────────────────────────────────────────────

  @Index('notif_logs_status_idx')
  @Default('pending')
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare status: NotificationLogStatus;

  // ─── Retry tracking (used by NotificationRetryWorker) ────────────────────────

  /** Number of worker retries completed so far (does not include the initial send) */
  @Default(0)
  @AllowNull(false)
  @Column({ field: 'retry_count', type: DataType.INTEGER })
  declare retryCount: number;

  /**
   * Earliest time the retry worker should pick this record up.
   * null = not yet scheduled for retry (either pending or already succeeded).
   */
  @Index('notif_logs_next_retry_idx')
  @AllowNull(true)
  @Column({ field: 'next_retry_at', type: DataType.DATE })
  declare nextRetryAt: Date;

  // ─── Debug data ──────────────────────────────────────────────────────────────

  /** Full template payload — useful for replaying failed notifications */
  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare payload: object;

  /** Last error message on failure */
  @AllowNull(true)
  @Column({ field: 'error_message', type: DataType.TEXT })
  declare errorMessage: string;

  /** Raw channel response — e.g. WA message ID, delivery receipt, SMTP status */
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare response: string;

  // ─── Timestamps ──────────────────────────────────────────────────────────────

  /** Timestamp of successful delivery */
  @AllowNull(true)
  @Column({ field: 'sent_at', type: DataType.DATE })
  declare sentAt: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
