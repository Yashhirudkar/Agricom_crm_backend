import { QueryInterface } from 'sequelize';

export const phase = '70';
export const name = 'sales-contract-destination-selection';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contracts
       ADD COLUMN IF NOT EXISTS destination_selection_mode VARCHAR(20) DEFAULT 'select',
       ADD COLUMN IF NOT EXISTS enquiry_destination VARCHAR(500);`,
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
      `ALTER TABLE sales_contracts
       DROP COLUMN IF EXISTS destination_selection_mode,
       DROP COLUMN IF EXISTS enquiry_destination;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
