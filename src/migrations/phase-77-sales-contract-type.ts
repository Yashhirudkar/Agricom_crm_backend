import { QueryInterface } from 'sequelize';

export const phase = '77';
export const name = 'add contract type to sales contracts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contracts
       ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'Export'`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Keep the column: older application versions may already have written contract types.
}
