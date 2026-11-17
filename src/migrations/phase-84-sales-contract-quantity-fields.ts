import { QueryInterface } from 'sequelize';

export const phase = '84';
export const name = 'add dynamic quantity and transport fields to sales contracts and items';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Add fields to sales_contracts
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contracts
       ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(50) DEFAULT 'sea',
       ADD COLUMN IF NOT EXISTS container_type VARCHAR(50) DEFAULT '40 FT',
       ADD COLUMN IF NOT EXISTS tolerance_percentage DECIMAL(5, 2) DEFAULT 5.00;`,
      { transaction },
    );

    // 2. Add fields to sales_contract_items
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_items
       ADD COLUMN IF NOT EXISTS container_type VARCHAR(50) DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS unit_count DECIMAL(10, 2) DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS tolerance_percentage DECIMAL(5, 2) DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS quantity_description TEXT DEFAULT NULL;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // Retain columns for backward compatibility
}

