import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '06';
export const name = 'Sales Contract Architecture (Header, Items, Documents & Files)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. sales_contracts ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'sales_contracts',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      contract_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      financial_year: { type: DataTypes.STRING(20), allowNull: false },
      contract_date: { type: DataTypes.DATEONLY, allowNull: false },
      buyer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'RESTRICT',
      },
      seller_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'partners', key: 'id' },
        onDelete: 'SET NULL',
      },
      broker_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'partners', key: 'id' },
        onDelete: 'SET NULL',
      },
      currency_code: { type: DataTypes.STRING(10), allowNull: false },
      total_quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      shipment_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'shipment_types', key: 'id' },
        onDelete: 'RESTRICT',
      },
      payment_term_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'payment_terms', key: 'id' },
        onDelete: 'RESTRICT',
      },
      origin_country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'countries', key: 'id' },
        onDelete: 'RESTRICT',
      },
      destination_country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'countries', key: 'id' },
        onDelete: 'RESTRICT',
      },
      port_of_loading: { type: DataTypes.STRING(255), allowNull: true },
      port_of_discharge: { type: DataTypes.STRING(255), allowNull: true },
      origin_location_name: { type: DataTypes.STRING(255), allowNull: true },
      destination_location_name: { type: DataTypes.STRING(255), allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      origin_transport_mode: { type: DataTypes.STRING(30), allowNull: true, defaultValue: 'sea' },
      destination_transport_mode: { type: DataTypes.STRING(30), allowNull: true, defaultValue: 'sea' },
      terms: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
      other_conditions: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
      dispute_resolution: { type: DataTypes.JSONB, allowNull: true },
      force_majeure: { type: DataTypes.JSONB, allowNull: true },
      seller_company_name: { type: DataTypes.STRING(255), allowNull: true },
      seller_authorized_signatory: { type: DataTypes.STRING(255), allowNull: true },
      seller_signature: { type: DataTypes.TEXT, allowNull: true },
      seller_company_seal: { type: DataTypes.TEXT, allowNull: true },
      buyer_company_name: { type: DataTypes.STRING(255), allowNull: true },
      buyer_authorized_signatory: { type: DataTypes.STRING(255), allowNull: true },
      buyer_signature: { type: DataTypes.TEXT, allowNull: true },
      buyer_company_seal: { type: DataTypes.TEXT, allowNull: true },
      print_overrides: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Draft' },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('sales_contracts', ['status'], { name: 'sales_contracts_status' }).catch(() => { });
  await queryInterface.addIndex('sales_contracts', ['buyer_id'], { name: 'sales_contracts_buyer_id' }).catch(() => { });
  await queryInterface.addIndex('sales_contracts', ['financial_year'], { name: 'sales_contracts_financial_year' }).catch(() => { });

  // ─── 2. sales_contract_items ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'sales_contract_items',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      sales_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'RESTRICT',
      },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      bag_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'bag_types', key: 'id' },
        onDelete: 'RESTRICT',
      },
      packing_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'packing_types', key: 'id' },
        onDelete: 'RESTRICT',
      },
      bag_specification_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'bag_specifications', key: 'id' },
        onDelete: 'SET NULL',
      },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 3. sales_contract_documents ─────────────────────────────────────────────
  await queryInterface.createTable(
    'sales_contract_documents',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      sales_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      document_type: { type: DataTypes.STRING(100), allowNull: false },
      document_name: { type: DataTypes.STRING(255), allowNull: false },
      is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'PENDING' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 4. sales_contract_document_files ────────────────────────────────────────
  await queryInterface.createTable(
    'sales_contract_document_files',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      sales_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'sales_contract_documents', key: 'id' },
        onDelete: 'SET NULL',
      },
      file_name: { type: DataTypes.STRING(255), allowNull: false },
      file_path: { type: DataTypes.STRING(1000), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: true },
      file_size: { type: DataTypes.INTEGER, allowNull: true },
      uploaded_by: {
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

  console.log('✅ Phase 06 - Sales Contract tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('sales_contract_document_files').catch(() => { });
  await queryInterface.dropTable('sales_contract_documents').catch(() => { });
  await queryInterface.dropTable('sales_contract_items').catch(() => { });
  await queryInterface.dropTable('sales_contracts').catch(() => { });
  console.log('✅ Phase 06 - Sales Contract tables dropped');
}
