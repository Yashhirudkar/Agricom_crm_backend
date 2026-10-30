import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '62';
export const name = 'add-closure-details-to-enquiries';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // Add closure columns to enquiries
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS closure_reason VARCHAR(255);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS closure_remark TEXT;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;`,
      { transaction },
    );

    // Add closure columns to partner_followups
    await queryInterface.sequelize.query(
      `ALTER TABLE partner_followups ADD COLUMN IF NOT EXISTS closure_reason VARCHAR(255);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE partner_followups ADD COLUMN IF NOT EXISTS closure_remark TEXT;`,
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
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS closure_reason;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS closure_remark;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS closed_by;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS closed_at;`,
      { transaction },
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE partner_followups DROP COLUMN IF EXISTS closure_reason;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE partner_followups DROP COLUMN IF EXISTS closure_remark;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

