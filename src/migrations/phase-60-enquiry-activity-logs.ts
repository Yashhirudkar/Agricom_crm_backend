import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '60';
export const name = 'enquiry-activity-logs';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS enquiry_activity_logs (
        id BIGSERIAL PRIMARY KEY,
        enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        message TEXT,
        bid_amount DECIMAL(15, 4),
        offer_amount DECIMAL(15, 4),
        currency VARCHAR(10),
        changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        whatsapp_message_id VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_enquiry_activity_logs_enquiry_id ON enquiry_activity_logs(enquiry_id);
      CREATE INDEX IF NOT EXISTS idx_enquiry_activity_logs_activity_type ON enquiry_activity_logs(activity_type);
      CREATE INDEX IF NOT EXISTS idx_enquiry_activity_logs_created_at ON enquiry_activity_logs(created_at);
      `,
      { transaction },
    );

    // Backfill ENQUIRY_CREATED for existing enquiries so timeline is immediately populated
    await queryInterface.sequelize.query(
      `
      INSERT INTO enquiry_activity_logs (
        enquiry_id,
        activity_type,
        bid_amount,
        offer_amount,
        currency,
        changed_by_user_id,
        metadata,
        created_at
      )
      SELECT 
        e.id,
        'ENQUIRY_CREATED',
        e.buying_interest,
        e.offer_amount,
        e.bid_currency,
        e.created_by,
        jsonb_build_object(
          'enquiryNo', e.enquiry_no,
          'productName', p.name,
          'partnerName', part.entity_name,
          'creatorName', u.name,
          'quantity', e.quantity
        ),
        e.created_at
      FROM enquiries e
      LEFT JOIN products p ON e.product_id = p.id
      LEFT JOIN partners part ON e.partner_id = part.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM enquiry_activity_logs a 
        WHERE a.enquiry_id = e.id AND a.activity_type = 'ENQUIRY_CREATED'
      );
      `,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS enquiry_activity_logs CASCADE;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

