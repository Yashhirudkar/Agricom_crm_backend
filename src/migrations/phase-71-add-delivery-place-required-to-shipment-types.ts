import { QueryInterface } from 'sequelize';

export const phase = '71';
export const name = 'add-delivery-place-required-to-shipment-types';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_types
       ADD COLUMN IF NOT EXISTS purchase_contract_delivery_place_required BOOLEAN NOT NULL DEFAULT true,
       ADD COLUMN IF NOT EXISTS sales_contract_delivery_place_required BOOLEAN NOT NULL DEFAULT true;`,
      { transaction },
    );

    // Default FCA and FAS to false for Delivery Place requirement
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET purchase_contract_delivery_place_required = false,
           sales_contract_delivery_place_required = false
       WHERE UPPER(code) IN ('FCA', 'FAS');`,
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
      `ALTER TABLE shipment_types
       DROP COLUMN IF EXISTS purchase_contract_delivery_place_required,
       DROP COLUMN IF EXISTS sales_contract_delivery_place_required;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

