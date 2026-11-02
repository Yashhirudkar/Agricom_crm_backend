import { QueryInterface } from 'sequelize';

export const phase = '65';
export const name = 'add-annual-turnover';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS annual_turnover DECIMAL(18,2);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS partner_annual_turnover DECIMAL(18,2);`,
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
      `ALTER TABLE partners DROP COLUMN IF EXISTS annual_turnover;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS partner_annual_turnover;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

