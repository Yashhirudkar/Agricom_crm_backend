interface PostgreSqlConnection {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Array<Record<string, string>> }>;
}

const REQUIRED_MIGRATIONS = ['19', '53', '55', '57', '58', '76', '77', '78'];

const REQUIRED_COLUMNS = [
  'monthly_stock_sections.layout_x',
  'monthly_stock_sections.layout_y',
  'monthly_stock_sections.layout_width',
  'monthly_stock_sections.layout_height',
  'enquiries.broker_role_id',
  'enquiries.broker_id',
  'sales_contracts.contract_type',
  'sales_contract_shipments.origin',
  'sales_contract_shipments.destination',
  'sales_contract_shipments.manual_ready_override',
  'sales_contract_shipments.manual_ready_by',
  'sales_contract_shipments.manual_ready_at',
  'sales_contract_shipments.manual_ready_reason',
  'sales_contract_shipments.execution_status',
  'cargo_loading.warehouse_status',
  'cargo_loading.loading_start_time',
  'cargo_loading.loading_end_time',
  'cargo_loading.operator',
  'shipment_stuffings.shipment_id',
  'shipment_stuffings.warehouse_status',
  'shipment_stuffings.loading_status',
  'shipment_stuffings.loading_start_time',
  'shipment_stuffings.loading_end_time',
  'shipment_stuffings.operator',
  'shipment_stuffings.gross_weight',
  'shipment_stuffings.net_weight',
];

const REQUIRED_INDEXES = [
  'uq_cargo_loading_pending_shipment',
  'idx_app_modules_name',
  'idx_module_resources_name',
  'idx_module_resources_module_id',
  'idx_resource_actions_resource_id_name',
  'idx_client_module_access_module_client',
  'idx_client_action_access_action_client',
  'idx_role_action_permissions_role_action',
];

export async function validateProductionSchema(
  connection: PostgreSqlConnection,
): Promise<void> {
  try {
    const migrationResult = await connection.query(
      `SELECT phase
       FROM migrations_log
       WHERE direction = 'up' AND phase::text = ANY($1::text[])`,
      [REQUIRED_MIGRATIONS],
    );
    const appliedMigrations = new Set(
      migrationResult.rows.map(({ phase }) => phase),
    );
    const missingMigrations = REQUIRED_MIGRATIONS.filter(
      (phase) => !appliedMigrations.has(phase),
    );
    if (missingMigrations.length > 0) {
      throw new Error(`migration phases ${missingMigrations.join(', ')}`);
    }

    const columnResult = await connection.query(
      `SELECT required_column
       FROM unnest($1::text[]) AS required(required_column)
       WHERE NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = split_part(required_column, '.', 1)
           AND column_name = split_part(required_column, '.', 2)
       )`,
      [REQUIRED_COLUMNS],
    );
    if (columnResult.rows.length > 0) {
      throw new Error(
        `missing columns ${columnResult.rows.map(({ required_column }) => required_column).join(', ')}`,
      );
    }

    const precisionResult = await connection.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'shipment_stuffings'
         AND column_name IN ('gross_weight', 'net_weight')
         AND (data_type <> 'numeric' OR numeric_scale <> 3)`,
    );
    if (precisionResult.rows.length > 0) {
      throw new Error(
        `invalid shipment_stuffings weight precision for ${precisionResult.rows.map(({ column_name }) => column_name).join(', ')}`,
      );
    }

    const indexResult = await connection.query(
      `SELECT required_index
       FROM unnest($1::text[]) AS required(required_index)
       WHERE NOT EXISTS (
         SELECT 1
         FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = required_index
       )`,
      [REQUIRED_INDEXES],
    );
    if (indexResult.rows.length > 0) {
      throw new Error(
        `missing indexes ${indexResult.rows.map(({ required_index }) => required_index).join(', ')}`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Production database schema validation failed (${detail}). Apply pending migrations with "npm run migrate" before starting the application.`,
    );
  }
}
