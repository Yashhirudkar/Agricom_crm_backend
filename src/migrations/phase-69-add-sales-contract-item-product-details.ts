import { QueryInterface } from 'sequelize';

export const phase = '69';
export const name = 'add-sales-contract-item-product-details';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_items
       ADD COLUMN IF NOT EXISTS origin VARCHAR(150),
       ADD COLUMN IF NOT EXISTS quality VARCHAR(255),
       ADD COLUMN IF NOT EXISTS marking VARCHAR(500);`,
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
      `ALTER TABLE sales_contract_items
       DROP COLUMN IF EXISTS origin,
       DROP COLUMN IF EXISTS quality,
       DROP COLUMN IF EXISTS marking;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
