import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '08';
export const name = 'Masters Tables (countries, currencies, categories, hs_codes, financial_years, payment_terms, shipment_types, trade_documents)';

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
  await queryInterface.addIndex('countries', ['is_active'], { name: 'countries_is_active' }).catch(() => {});

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
  await queryInterface.addIndex('currencies', ['status'], { name: 'currencies_status' }).catch(() => {});
  await queryInterface.addIndex('currencies', ['is_active'], { name: 'currencies_is_active' }).catch(() => {});
  await queryInterface.addIndex('currencies', ['code'], { name: 'currencies_code' }).catch(() => {});

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
  await queryInterface.addIndex('categories', ['is_active'], { name: 'categories_is_active' }).catch(() => {});

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
  await queryInterface.addIndex('hs_codes', ['is_active'], { name: 'hs_codes_is_active' }).catch(() => {});
  await queryInterface.addIndex('hs_codes', ['code'], { name: 'hs_codes_code' }).catch(() => {});
  await queryInterface.addIndex('hs_codes', ['description'], { name: 'hs_codes_description' }).catch(() => {});

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
  await queryInterface.addIndex('financial_years', ['status'], { name: 'financial_years_status' }).catch(() => {});
  await queryInterface.addIndex('financial_years', ['is_current'], { name: 'financial_years_is_current' }).catch(() => {});

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
  await queryInterface.addIndex('payment_terms', ['status'], { name: 'payment_terms_status' }).catch(() => {});

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
  await queryInterface.addIndex('shipment_types', ['status'], { name: 'shipment_types_status' }).catch(() => {});

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
  await queryInterface.addIndex('trade_documents', ['status'], { name: 'trade_documents_status' }).catch(() => {});

  console.log('✅ Phase 08 - Masters tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('trade_documents').catch(() => {});
  await queryInterface.dropTable('shipment_types').catch(() => {});
  await queryInterface.dropTable('payment_terms').catch(() => {});
  await queryInterface.dropTable('financial_years').catch(() => {});
  await queryInterface.dropTable('hs_codes').catch(() => {});
  await queryInterface.dropTable('categories').catch(() => {});
  await queryInterface.dropTable('currencies').catch(() => {});
  await queryInterface.dropTable('countries').catch(() => {});
  console.log('✅ Phase 08 - Masters tables dropped');
}
