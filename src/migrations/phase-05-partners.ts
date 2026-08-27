import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '05';
export const name = 'Partners & Risk Intelligence Architecture (Partners, Role Configs, D&B Reports)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. partner_roles ─────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_roles',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('partner_roles', ['is_active'], { name: 'partner_roles_is_active' }).catch(() => { });

  // ─── 2. partner_role_dynamic_configs ─────────────────────────────────────────
  await queryInterface.createTable(
    'partner_role_dynamic_configs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'partner_role_id',
        references: { model: 'partner_roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      config_name: { type: DataTypes.STRING(200), allowNull: false, field: 'config_name' },
      schema_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'schema_json' },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('partner_role_dynamic_configs', ['partner_role_id'], { name: 'partner_role_dynamic_configs_role_id' }).catch(() => { });
  await queryInterface.addIndex('partner_role_dynamic_configs', ['is_active'], { name: 'partner_role_dynamic_configs_is_active' }).catch(() => { });
  await queryInterface.addIndex('partner_role_dynamic_configs', ['partner_role_id', 'version'], { name: 'partner_role_dynamic_configs_role_version' }).catch(() => { });

  // ─── 3. partner_dynamic_config_history ───────────────────────────────────────
  await queryInterface.createTable(
    'partner_dynamic_config_history',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      config_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'config_id',
        references: { model: 'partner_role_dynamic_configs', key: 'id' },
        onDelete: 'CASCADE',
      },
      schema_json: { type: DataTypes.JSONB, allowNull: false, field: 'schema_json' },
      change_note: { type: DataTypes.TEXT, allowNull: true, field: 'change_note' },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'created_by',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('partner_dynamic_config_history', ['config_id'], { name: 'partner_dynamic_config_history_config_id' }).catch(() => { });
  await queryInterface.addIndex('partner_dynamic_config_history', ['created_at'], { name: 'partner_dynamic_config_history_created_at' }).catch(() => { });

  // ─── 4. partners (including year_of_establishment) ───────────────────────────
  await queryInterface.createTable(
    'partners',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      entity_name: { type: DataTypes.STRING(200), allowNull: false },
      partner_role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partner_roles', key: 'id' },
        onDelete: 'RESTRICT',
      },
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'countries', key: 'id' },
        onDelete: 'RESTRICT',
      },
      address: { type: DataTypes.STRING(1000), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      website: { type: DataTypes.STRING(300), allowNull: true },
      contact_email: { type: DataTypes.STRING(255), allowNull: true },
      tax_id: { type: DataTypes.STRING(50), allowNull: true },
      pan_no: { type: DataTypes.STRING(50), allowNull: true },
      inn_no: { type: DataTypes.STRING(50), allowNull: true },
      financial_status: { type: DataTypes.STRING(100), allowNull: true },
      year_of_establishment: { type: DataTypes.INTEGER, allowNull: true },
      product_notes: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('partners', ['entity_name'], { name: 'partners_entity_name' }).catch(() => { });
  await queryInterface.addIndex('partners', ['partner_role_id'], { name: 'partners_partner_role_id' }).catch(() => { });
  await queryInterface.addIndex('partners', ['country_id'], { name: 'partners_country_id' }).catch(() => { });

  // ─── 5. partner_contacts ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_contacts',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      designation: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(50), allowNull: true },
      is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. partner_dynamic_values ───────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_dynamic_values',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'CASCADE',
      },
      config_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partner_role_dynamic_configs', key: 'id' },
        onDelete: 'CASCADE',
      },
      schema_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      values_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      field_value: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('partner_dynamic_values', ['partner_id', 'config_id'], {
    name: 'partner_dynamic_values_partner_config_unique',
    unique: true,
  }).catch(() => { });

  // ─── 7. partner_followups ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_followups',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'CASCADE',
      },
      entity_type: { type: DataTypes.STRING(50), allowNull: true, field: 'entity_type' },
      entity_id: { type: DataTypes.INTEGER, allowNull: true, field: 'entity_id' },
      workspace_id: { type: DataTypes.INTEGER, allowNull: true, field: 'workspace_id' },
      followup_date: { type: DataTypes.DATE, allowNull: false, field: 'followup_date' },
      communication_type: { type: DataTypes.STRING(50), allowNull: false, field: 'communication_type' },
      buyer_remark: { type: DataTypes.TEXT, allowNull: true, field: 'buyer_remark' },
      our_response: { type: DataTypes.TEXT, allowNull: true, field: 'our_response' },
      next_followup_date: { type: DataTypes.DATE, allowNull: true, field: 'next_followup_date' },
      priority: { type: DataTypes.STRING(50), allowNull: true },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Pending' },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        field: 'created_by',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 8. partner_products ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_products',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 9. partner_dnb_reports ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'partner_dnb_reports',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'CASCADE',
      },
      report_date: { type: DataTypes.DATEONLY, allowNull: false },
      report_file: { type: DataTypes.STRING(500), allowNull: false },
      original_file_name: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: false },
      file_size: { type: DataTypes.INTEGER, allowNull: false },
      risk_factor: { type: DataTypes.STRING(20), allowNull: false },
      credit_limit: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      failure_score: { type: DataTypes.STRING(50), allowNull: false },
      paydex: { type: DataTypes.INTEGER, allowNull: false },
      dnb_rating: { type: DataTypes.STRING(50), allowNull: false },
      source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
      is_latest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_dnb_reports_single_latest 
    ON partner_dnb_reports (partner_id) 
    WHERE is_latest = true;
  `).catch(() => { });

  // ─── 10. role_partner_role_access ─────────────────────────────────────────────
  await queryInterface.createTable(
    'role_partner_role_access',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      partner_role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partner_roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('role_partner_role_access', ['role_id'], { name: 'role_partner_role_access_role_id' }).catch(() => { });
  await queryInterface.addIndex('role_partner_role_access', ['partner_role_id'], { name: 'role_partner_role_access_partner_role_id' }).catch(() => { });
  await queryInterface.addIndex('role_partner_role_access', ['role_id', 'partner_role_id'], { name: 'role_partner_role_access_unique', unique: true }).catch(() => { });

  console.log('✅ Phase 05 - Partners & DNB Reports tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('role_partner_role_access').catch(() => { });
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS partner_dnb_reports_single_latest;`).catch(() => { });
  await queryInterface.dropTable('partner_dnb_reports').catch(() => { });
  await queryInterface.dropTable('partner_products').catch(() => { });
  await queryInterface.dropTable('partner_followups').catch(() => { });
  await queryInterface.dropTable('partner_dynamic_values').catch(() => { });
  await queryInterface.dropTable('partner_contacts').catch(() => { });
  await queryInterface.dropTable('partners').catch(() => { });
  await queryInterface.dropTable('partner_dynamic_config_history').catch(() => { });
  await queryInterface.dropTable('partner_role_dynamic_configs').catch(() => { });
  await queryInterface.dropTable('partner_roles').catch(() => { });
  console.log('✅ Phase 05 - Partners & DNB Reports tables dropped');
}
