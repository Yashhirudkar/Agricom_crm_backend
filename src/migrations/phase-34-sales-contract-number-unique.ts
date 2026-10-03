import { QueryInterface } from 'sequelize';

export const phase = '34';
export const name = 'Ensure unique index on sales_contracts contract_number';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // The model already declares @Unique on contractNumber.
    // This migration ensures the unique constraint/index exists in DB
    // even for environments that bootstrapped before this change.
    // Using IF NOT EXISTS to be idempotent.

    // Check if the unique constraint already exists
    const [results]: any = await queryInterface.sequelize.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_name = 'sales_contracts'
         AND constraint_type = 'UNIQUE'
         AND constraint_name LIKE '%contract_number%'
       LIMIT 1`,
      { transaction },
    );

    if (!results || results.length === 0) {
      // Add unique constraint if missing
      await queryInterface.sequelize.query(
        `ALTER TABLE sales_contracts
         ADD CONSTRAINT sales_contracts_contract_number_key UNIQUE (contract_number)`,
        { transaction },
      );
    }

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
       DROP CONSTRAINT IF EXISTS sales_contracts_contract_number_key`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
