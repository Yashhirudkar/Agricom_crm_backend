import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '72';
export const name = 'Add Freight Allocation Status To Shipments';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Add freight_allocation_status to sales_contract_shipments if it doesn't exist
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments
    ADD COLUMN IF NOT EXISTS freight_allocation_status VARCHAR(50) DEFAULT NULL;
  `);

  // 2. Set 'Yes' for shipments linked to Purchase Contracts where purchase_contract_delivery_place_required = false
  await sequelize.query(`
    UPDATE sales_contract_shipments scs
    SET freight_allocation_status = 'Yes'
    FROM purchase_contract_shipments pcs
    JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
    JOIN shipment_types st ON st.id = pc.shipment_type_id
    WHERE scs.id = pcs.shipment_id
      AND st.purchase_contract_delivery_place_required = false;
  `);

  // 3. Set 'Yes' for shipments linked to Sales Contracts where purchase_contract_delivery_place_required = false
  await sequelize.query(`
    UPDATE sales_contract_shipments scs
    SET freight_allocation_status = 'Yes'
    FROM sales_contracts sc
    JOIN shipment_types st ON st.id = sc.shipment_type_id
    WHERE scs.sales_contract_id = sc.id
      AND st.purchase_contract_delivery_place_required = false;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments
    DROP COLUMN IF EXISTS freight_allocation_status;
  `);
}
