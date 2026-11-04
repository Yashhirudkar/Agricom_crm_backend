import { QueryInterface } from 'sequelize';

export const phase = '66';
export const name = 'add-qty-per-count-to-sales-contract-items';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_items ADD COLUMN IF NOT EXISTS qty_per_count DECIMAL(12,2);`,
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
      `ALTER TABLE sales_contract_items DROP COLUMN IF EXISTS qty_per_count;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
