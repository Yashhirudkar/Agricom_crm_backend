import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '64';
export const name = 'shipment-route-mapping';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Add origin and destination columns to sales_contract_shipments if not present
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_shipments
       ADD COLUMN IF NOT EXISTS origin VARCHAR(255) NULL,
       ADD COLUMN IF NOT EXISTS destination VARCHAR(255) NULL;`,
      { transaction },
    );

    // 2. Create index for fast lookups
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_sc_shipments_origin ON sales_contract_shipments(origin);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_sc_shipments_destination ON sales_contract_shipments(destination);`,
      { transaction },
    );

    // 3. Backfill destination from sales_contracts (destination_location_name OR port_of_discharge)
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_shipments s
       SET destination = COALESCE(sc.destination_location_name, sc.port_of_discharge)
       FROM sales_contracts sc
       WHERE s.sales_contract_id = sc.id
         AND s.destination IS NULL
         AND (sc.destination_location_name IS NOT NULL OR sc.port_of_discharge IS NOT NULL);`,
      { transaction },
    );

    // 4. Backfill origin from purchase_contracts via purchase_contract_shipments
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_shipments s
       SET origin = pc.place_of_loading
       FROM purchase_contract_shipments pcs
       JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
       WHERE s.id = pcs.shipment_id
         AND s.origin IS NULL
         AND pc.place_of_loading IS NOT NULL;`,
      { transaction },
    );

    // 5. Backfill origin from purchase_contracts via sales_contract_id (fallback)
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_shipments s
       SET origin = pc.place_of_loading
       FROM purchase_contracts pc
       WHERE s.sales_contract_id = pc.sales_contract_id
         AND s.origin IS NULL
         AND pc.place_of_loading IS NOT NULL;`,
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
      `DROP INDEX IF EXISTS idx_sc_shipments_origin;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_sc_shipments_destination;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_shipments
       DROP COLUMN IF EXISTS origin,
       DROP COLUMN IF EXISTS destination;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

