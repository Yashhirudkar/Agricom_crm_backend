import { QueryInterface } from 'sequelize';

export const phase = '104';
export const name = 'add stuffing execution groups and export invoice group mapping';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const seq = queryInterface.sequelize;

    await seq.query(
      `CREATE TABLE IF NOT EXISTS stuffing_execution_groups (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NULL REFERENCES companies(id) ON DELETE SET NULL,
        sales_contract_id INTEGER NOT NULL REFERENCES sales_contracts(id) ON DELETE CASCADE,
        primary_shipment_id INTEGER NULL REFERENCES sales_contract_shipments(id) ON DELETE SET NULL,
        group_reference VARCHAR(100) NULL,
        transport_category VARCHAR(50) NULL,
        stuffing_status VARCHAR(50) NOT NULL DEFAULT 'Draft',
        execution_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        combined_actual_loading_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        combined_gross_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        combined_net_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        auto_populated_data JSONB NULL,
        completed_at TIMESTAMPTZ NULL,
        created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_stuffing_exec_groups_company_id ON stuffing_execution_groups(company_id);
       CREATE INDEX IF NOT EXISTS idx_stuffing_exec_groups_sales_contract_id ON stuffing_execution_groups(sales_contract_id);
       CREATE INDEX IF NOT EXISTS idx_stuffing_exec_groups_primary_shipment_id ON stuffing_execution_groups(primary_shipment_id);
       CREATE INDEX IF NOT EXISTS idx_stuffing_exec_groups_status ON stuffing_execution_groups(stuffing_status);`,
      { transaction },
    );

    await seq.query(
      `CREATE TABLE IF NOT EXISTS stuffing_execution_group_items (
        id SERIAL PRIMARY KEY,
        stuffing_group_id INTEGER NOT NULL REFERENCES stuffing_execution_groups(id) ON DELETE CASCADE,
        shipment_id INTEGER NOT NULL UNIQUE REFERENCES sales_contract_shipments(id) ON DELETE CASCADE,
        shipment_stuffing_id INTEGER NOT NULL UNIQUE REFERENCES shipment_stuffings(id) ON DELETE CASCADE,
        sequence_order INTEGER NOT NULL DEFAULT 1,
        allocated_loading_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        allocated_gross_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        allocated_net_weight DECIMAL(12, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_stuffing_exec_group_items_group_id ON stuffing_execution_group_items(stuffing_group_id);`,
      { transaction },
    );

    await seq.query(
      `CREATE TABLE IF NOT EXISTS export_invoice_stuffing_groups (
        id SERIAL PRIMARY KEY,
        export_invoice_id INTEGER NOT NULL UNIQUE REFERENCES export_invoices(id) ON DELETE CASCADE,
        stuffing_group_id INTEGER NULL REFERENCES stuffing_execution_groups(id) ON DELETE SET NULL,
        shipment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_export_invoice_stuffing_groups_group_id ON export_invoice_stuffing_groups(stuffing_group_id);`,
      { transaction },
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const seq = queryInterface.sequelize;
    await seq.query(
      `DROP TABLE IF EXISTS export_invoice_stuffing_groups CASCADE;
       DROP TABLE IF EXISTS stuffing_execution_group_items CASCADE;
       DROP TABLE IF EXISTS stuffing_execution_groups CASCADE;`,
      { transaction },
    );
  });
}
