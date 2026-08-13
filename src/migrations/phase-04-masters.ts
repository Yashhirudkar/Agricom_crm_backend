import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '04';
export const name = 'Master Data Architecture (Countries, Currencies, Products & Specifications)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. countries ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'countries',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      iso2_code: { type: DataTypes.STRING(2), allowNull: false, unique: true },
      iso3_code: { type: DataTypes.STRING(3), allowNull: false, unique: true },
      phone_code: { type: DataTypes.STRING(20), allowNull: true },
      currency_code: { type: DataTypes.STRING(10), allowNull: true },
      region: { type: DataTypes.STRING(100), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('countries', ['is_active'], { name: 'countries_is_active' }).catch(() => { });

  // ─── 2. currencies ────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'currencies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
      symbol: { type: DataTypes.STRING(20), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('currencies', ['status'], { name: 'currencies_status' }).catch(() => { });
  await queryInterface.addIndex('currencies', ['is_active'], { name: 'currencies_is_active' }).catch(() => { });
  await queryInterface.addIndex('currencies', ['code'], { name: 'currencies_code' }).catch(() => { });

  // ─── 3. categories ────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'categories',
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
  await queryInterface.addIndex('categories', ['is_active'], { name: 'categories_is_active' }).catch(() => { });

  // ─── 4. hs_codes ──────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'hs_codes',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(300), allowNull: false },
      chapter: { type: DataTypes.STRING(50), allowNull: true },
      sub_heading: { type: DataTypes.STRING(100), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('hs_codes', ['is_active'], { name: 'hs_codes_is_active' }).catch(() => { });
  await queryInterface.addIndex('hs_codes', ['code'], { name: 'hs_codes_code' }).catch(() => { });
  await queryInterface.addIndex('hs_codes', ['description'], { name: 'hs_codes_description' }).catch(() => { });

  // ─── 5. financial_years ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'financial_years',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      year: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      display_name: { type: DataTypes.STRING(100), allowNull: false },
      is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('financial_years', ['status'], { name: 'financial_years_status' }).catch(() => { });
  await queryInterface.addIndex('financial_years', ['is_current'], { name: 'financial_years_is_current' }).catch(() => { });

  // ─── 6. payment_terms ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'payment_terms',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      credit_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      description: { type: DataTypes.STRING(500), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('payment_terms', ['status'], { name: 'payment_terms_status' }).catch(() => { });

  // ─── 7. shipment_types ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'shipment_types',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('shipment_types', ['status'], { name: 'shipment_types_status' }).catch(() => { });

  // ─── 8. trade_documents ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'trade_documents',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      mandatory_by_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );
  await queryInterface.addIndex('trade_documents', ['status'], { name: 'trade_documents_status' }).catch(() => { });

  // ─── 9. bag_types ────────────────────────────────────────────────────────────
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

  // ─── 10. packing_types ────────────────────────────────────────────────────────
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

  // ─── 11. bag_specifications ──────────────────────────────────────────────────
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

  // ─── 12. products (including hs_code string column natively) ──────────────────
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
      hs_code: { type: DataTypes.STRING(100), allowNull: true },
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

  await queryInterface.addIndex('products', ['name'], { name: 'products_name' }).catch(() => { });
  await queryInterface.addIndex('products', ['category_id'], { name: 'products_category_id' }).catch(() => { });

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

  console.log('✅ Phase 04 - Master Data tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('product_bag_assignments').catch(() => { });
  await queryInterface.dropTable('products').catch(() => { });
  await queryInterface.dropTable('bag_specifications').catch(() => { });
  await queryInterface.dropTable('packing_types').catch(() => { });
  await queryInterface.dropTable('bag_types').catch(() => { });
  await queryInterface.dropTable('trade_documents').catch(() => { });
  await queryInterface.dropTable('shipment_types').catch(() => { });
  await queryInterface.dropTable('payment_terms').catch(() => { });
  await queryInterface.dropTable('financial_years').catch(() => { });
  await queryInterface.dropTable('hs_codes').catch(() => { });
  await queryInterface.dropTable('categories').catch(() => { });
  await queryInterface.dropTable('currencies').catch(() => { });
  await queryInterface.dropTable('countries').catch(() => { });
  console.log('✅ Phase 04 - Master Data tables dropped');
}
