import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '09';
export const name = 'Partners & Products Tables (partner_roles, partner_role_dynamic_configs, partner_dynamic_config_history, partners, partner_contacts, partner_dynamic_values, partner_followups, products, partner_products, bag_types, packing_types, bag_specifications, product_bag_assignments)';

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
  await queryInterface.addIndex('partner_roles', ['is_active'], { name: 'partner_roles_is_active' }).catch(() => {});

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

  await queryInterface.addIndex('partner_role_dynamic_configs', ['partner_role_id'], { name: 'partner_role_dynamic_configs_role_id' }).catch(() => {});
  await queryInterface.addIndex('partner_role_dynamic_configs', ['is_active'], { name: 'partner_role_dynamic_configs_is_active' }).catch(() => {});
  await queryInterface.addIndex('partner_role_dynamic_configs', ['partner_role_id', 'version'], { name: 'partner_role_dynamic_configs_role_version' }).catch(() => {});

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

  await queryInterface.addIndex('partner_dynamic_config_history', ['config_id'], { name: 'partner_dynamic_config_history_config_id' }).catch(() => {});
  await queryInterface.addIndex('partner_dynamic_config_history', ['created_at'], { name: 'partner_dynamic_config_history_created_at' }).catch(() => {});

  // ─── 4. partners ─────────────────────────────────────────────────────────────
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
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('partners', ['entity_name'], { name: 'partners_entity_name' }).catch(() => {});
  await queryInterface.addIndex('partners', ['partner_role_id'], { name: 'partners_partner_role_id' }).catch(() => {});
  await queryInterface.addIndex('partners', ['country_id'], { name: 'partners_country_id' }).catch(() => {});

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
      field_value: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

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
      followup_date: { type: DataTypes.DATEONLY, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'PENDING' },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 8. products ──────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'products',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'categories', key: 'id' },
        onDelete: 'RESTRICT',
      },
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'countries', key: 'id' },
        onDelete: 'RESTRICT',
      },
      hs_code_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'hs_codes', key: 'id' },
        onDelete: 'RESTRICT',
      },
      quality_sub_type: { type: DataTypes.STRING(100), allowNull: true },
      specification: { type: DataTypes.STRING(1000), allowNull: true },
      qty_20ft_container: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      qty_40ft_container: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      qty_40hc_container: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      truck_capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      wagon_capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('products', ['name'], { name: 'products_name' }).catch(() => {});
  await queryInterface.addIndex('products', ['category_id'], { name: 'products_category_id' }).catch(() => {});

  // ─── 9. partner_products ─────────────────────────────────────────────────────
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

  // ─── 10. bag_types ────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'bag_types',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 11. packing_types ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'packing_types',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 12. bag_specifications ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'bag_specifications',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      bag_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'bag_types', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      weight_kg: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
      capacity_kg: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
      dimensions: { type: DataTypes.STRING(100), allowNull: true },
      material: { type: DataTypes.STRING(100), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 13. product_bag_assignments ─────────────────────────────────────────────
  await queryInterface.createTable(
    'product_bag_assignments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'CASCADE',
      },
      bag_specification_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'bag_specifications', key: 'id' },
        onDelete: 'CASCADE',
      },
      packing_type_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'packing_types', key: 'id' },
        onDelete: 'SET NULL',
      },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 09 - Partners & Products tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('product_bag_assignments').catch(() => {});
  await queryInterface.dropTable('bag_specifications').catch(() => {});
  await queryInterface.dropTable('packing_types').catch(() => {});
  await queryInterface.dropTable('bag_types').catch(() => {});
  await queryInterface.dropTable('partner_products').catch(() => {});
  await queryInterface.dropTable('products').catch(() => {});
  await queryInterface.dropTable('partner_followups').catch(() => {});
  await queryInterface.dropTable('partner_dynamic_values').catch(() => {});
  await queryInterface.dropTable('partner_contacts').catch(() => {});
  await queryInterface.dropTable('partners').catch(() => {});
  await queryInterface.dropTable('partner_dynamic_config_history').catch(() => {});
  await queryInterface.dropTable('partner_role_dynamic_configs').catch(() => {});
  await queryInterface.dropTable('partner_roles').catch(() => {});
  console.log('✅ Phase 09 - Partners & Products tables dropped');
}

