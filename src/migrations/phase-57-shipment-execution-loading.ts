import { QueryInterface } from 'sequelize';

export const phase = '57';
export const name = 'create loading execution records for shipment execution';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      'ALTER TABLE cargo_loading ALTER COLUMN truck_no DROP NOT NULL',
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_cargo_loading_pending_shipment
       ON cargo_loading (shipment_id)
       WHERE truck_no IS NULL`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE TABLE IF NOT EXISTS shipment_stuffings (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NULL,
        shipment_id INTEGER NOT NULL UNIQUE,
        sales_contract_id INTEGER NULL,
        stuffing_status VARCHAR(50) NOT NULL DEFAULT 'Draft',
        execution_status VARCHAR(50) NOT NULL DEFAULT 'Draft',
        warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        loading_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        auto_populated_data JSONB NULL,
        stuffing_date DATE NULL,
        stuffing_start_time VARCHAR(50) NULL,
        stuffing_end_time VARCHAR(50) NULL,
        stuffing_location VARCHAR(255) NULL,
        supervisor VARCHAR(255) NULL,
        operator VARCHAR(255) NULL,
        loading_date DATE NULL,
        actual_loading_weight DECIMAL(12, 2) DEFAULT 0,
        gross_weight DECIMAL(12, 2) DEFAULT 0,
        net_weight DECIMAL(12, 2) DEFAULT 0,
        freight_overrides JSONB NULL,
        containers JSONB DEFAULT '[]'::jsonb,
        trucks JSONB DEFAULT '[]'::jsonb,
        attachments JSONB DEFAULT '[]'::jsonb,
        remarks TEXT NULL,
        completed_at TIMESTAMP WITH TIME ZONE NULL,
        created_by INTEGER NULL,
        updated_by INTEGER NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_shipment_stuffings_shipment'
             AND conrelid = 'shipment_stuffings'::regclass
         ) THEN
           ALTER TABLE shipment_stuffings
             ADD CONSTRAINT fk_shipment_stuffings_shipment
             FOREIGN KEY (shipment_id)
             REFERENCES sales_contract_shipments(id) ON DELETE CASCADE;
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_shipment_stuffings_sales_contract'
             AND conrelid = 'shipment_stuffings'::regclass
         ) THEN
           ALTER TABLE shipment_stuffings
             ADD CONSTRAINT fk_shipment_stuffings_sales_contract
             FOREIGN KEY (sales_contract_id)
             REFERENCES sales_contracts(id) ON DELETE SET NULL;
         END IF;
       END $$`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `INSERT INTO shipment_stuffings (
         company_id, shipment_id, sales_contract_id, stuffing_status,
         execution_status, auto_populated_data, remarks
       )
       SELECT COALESCE(s.company_id, sc.company_id), s.id, s.sales_contract_id,
              'Draft', 'Draft', '{}'::jsonb,
              'Legacy Executed shipment; verify execution details.'
       FROM sales_contract_shipments s
       LEFT JOIN sales_contracts sc ON sc.id = s.sales_contract_id
       WHERE s.status = 'Executed'
       ON CONFLICT (shipment_id) DO NOTHING`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `INSERT INTO cargo_loading (
         company_id, business_transaction_id, cargo_availability_id,
         shipment_allocation_id, shipment_id, loading_date, truck_no,
         loaded_qty, status, timeline, remarks
       )
       SELECT COALESCE(s.company_id, sc.company_id), s.business_transaction_id,
              allocation.cargo_availability_id, allocation.id, s.id,
              s.shipment_date, NULL, 0, 'Draft',
              jsonb_build_array(jsonb_build_object(
                'stage', 'Draft',
                'timestamp', NOW(),
                'user', 'System',
                'remarks', 'Created from a legacy Executed shipment; verify before loading.'
              )),
              'Legacy Executed shipment; verify execution details.'
       FROM sales_contract_shipments s
       LEFT JOIN sales_contracts sc ON sc.id = s.sales_contract_id
       LEFT JOIN LATERAL (
         SELECT csa.id, csa.cargo_availability_id
         FROM cargo_shipment_allocations csa
         WHERE csa.shipment_id = s.id AND csa.status = 'Active'
         ORDER BY csa.created_at ASC
         LIMIT 1
       ) allocation ON TRUE
       WHERE s.status = 'Executed'
         AND NOT EXISTS (
           SELECT 1 FROM cargo_loading cl WHERE cl.shipment_id = s.id
         )
       ON CONFLICT DO NOTHING`,
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
    const [pendingRows] = await queryInterface.sequelize.query(
      'SELECT id FROM cargo_loading WHERE truck_no IS NULL LIMIT 1',
      { transaction },
    );
    if (pendingRows.length > 0) {
      throw new Error(
        'Cannot restore truck_no NOT NULL while pending execution records exist.',
      );
    }
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS uq_cargo_loading_pending_shipment',
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_stuffings
         DROP CONSTRAINT IF EXISTS fk_shipment_stuffings_sales_contract,
         DROP CONSTRAINT IF EXISTS fk_shipment_stuffings_shipment`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE cargo_loading ALTER COLUMN truck_no SET NOT NULL',
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
