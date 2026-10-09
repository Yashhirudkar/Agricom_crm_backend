import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '27';
export const name = 'Notification Logs — WhatsApp / Channel Dispatch';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── notification_logs ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'notification_logs',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },

      // What type of business entity triggered this notification
      entity_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'e.g. Enquiry, Quotation, SalesContract',
      },
      // UUID or integer ID of the triggering entity
      entity_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID of the related entity (UUID or integer as string)',
      },

      // Notification classification
      template: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'e.g. NEW_ENQUIRY, NEW_QUOTATION',
      },
      channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'whatsapp | email | sms',
      },

      // Resolved destination (group JID, email, phone)
      recipient: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      // Delivery state machine
      // pending  → first send queued / in-progress
      // success  → delivered
      // failed   → last attempt failed; worker will retry if retryCount < MAX
      // exhausted → all retries used, no further attempts
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },

      // Worker retry tracking
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of worker retries attempted so far',
      },
      next_retry_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Earliest time the worker should pick this up for retry',
      },

      // Debug data
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Template payload for replay / debugging',
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      response: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Raw channel response (message ID, delivery receipt, etc.)',
      },

      // Delivery timestamp
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  // Indexes for the retry worker query (status + retry_count + next_retry_at)
  await queryInterface
    .addIndex('notification_logs', ['status'], {
      name: 'notif_logs_status_idx',
    })
    .catch(() => {});

  await queryInterface
    .addIndex('notification_logs', ['channel', 'template'], {
      name: 'notif_logs_channel_template_idx',
    })
    .catch(() => {});

  await queryInterface
    .addIndex('notification_logs', ['next_retry_at'], {
      name: 'notif_logs_next_retry_idx',
    })
    .catch(() => {});

  await queryInterface
    .addIndex('notification_logs', ['entity_type', 'entity_id'], {
      name: 'notif_logs_entity_idx',
    })
    .catch(() => {});

  console.log('✅ Phase 27 — notification_logs table created');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('notification_logs').catch(() => {});
  console.log('✅ Phase 27 — notification_logs dropped');
}
