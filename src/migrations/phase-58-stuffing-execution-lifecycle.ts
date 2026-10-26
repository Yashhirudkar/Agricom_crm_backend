import { QueryInterface } from 'sequelize';

export const phase = '58';
export const name = 'add stuffing and shipment execution lifecycle';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_shipments
         ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) NULL`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_stuffings
         ADD COLUMN IF NOT EXISTS warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
         ADD COLUMN IF NOT EXISTS loading_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
         ADD COLUMN IF NOT EXISTS loading_start_time VARCHAR(50) NULL,
         ADD COLUMN IF NOT EXISTS loading_end_time VARCHAR(50) NULL,
         ADD COLUMN IF NOT EXISTS operator VARCHAR(255) NULL`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE cargo_loading
         ADD COLUMN IF NOT EXISTS warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
         ADD COLUMN IF NOT EXISTS loading_start_time VARCHAR(50) NULL,
         ADD COLUMN IF NOT EXISTS loading_end_time VARCHAR(50) NULL,
         ADD COLUMN IF NOT EXISTS operator VARCHAR(255) NULL;
       ALTER TABLE cargo_loading ALTER COLUMN status SET DEFAULT 'Pending'`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_shipments
       SET execution_status = CASE
         WHEN status IN ('Completed', 'Delivered') THEN 'Completed'
         WHEN status = 'Dispatched' THEN 'Dispatched'
         WHEN status = 'Executed' THEN 'Pending'
         ELSE NULL
       END
       WHERE execution_status IS NULL`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `UPDATE shipment_stuffings
       SET execution_status = CASE
         WHEN stuffing_status = 'Completed' THEN 'Stuffing Completed'
         ELSE 'Pending'
       END,
       warehouse_status = COALESCE(NULLIF(warehouse_status, ''), 'Pending'),
       loading_status = CASE
         WHEN stuffing_status = 'Completed' THEN 'Loading Completed'
         ELSE 'Pending'
       END
       WHERE execution_status IN ('Draft', 'Stuffed')`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `UPDATE cargo_loading
       SET warehouse_status = CASE
         WHEN status IN ('Dispatched', 'Reached Destination', 'Unloaded', 'Verified', 'Completed')
           THEN 'Completed'
         WHEN status IN ('Loading Started', 'Loading Completed', 'Weighment Out')
           THEN 'In Progress'
         ELSE 'Pending'
       END`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_shipments s
       SET execution_status = CASE
         WHEN (
           SELECT cl.status FROM cargo_loading cl
           WHERE cl.shipment_id = s.id
           ORDER BY cl.created_at DESC LIMIT 1
         ) = 'Draft' THEN 'Pending'
         ELSE (
           SELECT cl.status FROM cargo_loading cl
           WHERE cl.shipment_id = s.id
           ORDER BY cl.created_at DESC LIMIT 1
         )
       END
       WHERE s.status IN ('Executed', 'Dispatched', 'Completed')
         AND EXISTS (SELECT 1 FROM cargo_loading cl WHERE cl.shipment_id = s.id)`,
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
      `ALTER TABLE cargo_loading
         DROP COLUMN IF EXISTS warehouse_status,
         DROP COLUMN IF EXISTS loading_start_time,
         DROP COLUMN IF EXISTS loading_end_time,
         DROP COLUMN IF EXISTS operator;
       ALTER TABLE shipment_stuffings
         DROP COLUMN IF EXISTS warehouse_status,
         DROP COLUMN IF EXISTS loading_status,
         DROP COLUMN IF EXISTS loading_start_time,
         DROP COLUMN IF EXISTS loading_end_time,
         DROP COLUMN IF EXISTS operator;
       ALTER TABLE sales_contract_shipments DROP COLUMN IF EXISTS execution_status`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE cargo_loading ALTER COLUMN status SET DEFAULT 'Draft'",
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
