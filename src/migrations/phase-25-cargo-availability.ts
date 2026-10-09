import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '25';
export const name = 'Cargo Availability & Loading Operations Module';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. cargo_availability
  await queryInterface.createTable(
    'cargo_availability',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      purchase_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchase_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      purchase_contract_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'purchase_contract_items', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'RESTRICT',
      },
      purchase_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Pending Readiness',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_ca_purchase_contract_id ON cargo_availability(purchase_contract_id);
    CREATE INDEX IF NOT EXISTS idx_ca_purchase_contract_item_id ON cargo_availability(purchase_contract_item_id);
    CREATE INDEX IF NOT EXISTS idx_ca_product_id ON cargo_availability(product_id);
  `);

  // 2. cargo_readiness
  await queryInterface.createTable(
    'cargo_readiness',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      cargo_availability_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'cargo_availability', key: 'id' },
        onDelete: 'CASCADE',
      },
      warehouse_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'partners', key: 'id' },
        onDelete: 'SET NULL',
      },
      warehouse_name: { type: DataTypes.STRING(255), allowNull: true },
      ready_date: { type: DataTypes.DATEONLY, allowNull: false },
      ready_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      bag_bulk: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Bag',
      },
      uom: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'MT' },
      lot_number: { type: DataTypes.STRING(100), allowNull: true },
      batch_number: { type: DataTypes.STRING(100), allowNull: true },
      stack_number: { type: DataTypes.STRING(100), allowNull: true },
      storage_location: { type: DataTypes.STRING(255), allowNull: true },
      moisture: { type: DataTypes.STRING(50), allowNull: true },
      foreign_matter: { type: DataTypes.STRING(50), allowNull: true },
      quality_grade: { type: DataTypes.STRING(100), allowNull: true },
      inspection_status: { type: DataTypes.STRING(100), allowNull: true },
      qc_remarks: { type: DataTypes.TEXT, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      internal_notes: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Draft',
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_cr_cargo_availability_id ON cargo_readiness(cargo_availability_id);
    CREATE INDEX IF NOT EXISTS idx_cr_status ON cargo_readiness(status);
    CREATE INDEX IF NOT EXISTS idx_cr_ready_date ON cargo_readiness(ready_date);
  `);

  // 3. cargo_shipment_allocations
  await queryInterface.createTable(
    'cargo_shipment_allocations',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      cargo_availability_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'cargo_availability', key: 'id' },
        onDelete: 'CASCADE',
      },
      shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contract_shipments', key: 'id' },
        onDelete: 'CASCADE',
      },
      allocated_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Active',
      },
      allocated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      allocated_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_csa_cargo_availability_id ON cargo_shipment_allocations(cargo_availability_id);
    CREATE INDEX IF NOT EXISTS idx_csa_shipment_id ON cargo_shipment_allocations(shipment_id);
  `);

  // 4. cargo_loading
  await queryInterface.createTable(
    'cargo_loading',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      cargo_availability_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'cargo_availability', key: 'id' },
        onDelete: 'CASCADE',
      },
      shipment_allocation_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'cargo_shipment_allocations', key: 'id' },
        onDelete: 'SET NULL',
      },
      shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contract_shipments', key: 'id' },
        onDelete: 'CASCADE',
      },
      warehouse_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'partners', key: 'id' },
        onDelete: 'SET NULL',
      },
      warehouse_name: { type: DataTypes.STRING(255), allowNull: true },
      loading_date: { type: DataTypes.DATEONLY, allowNull: true },
      arrival_time: { type: DataTypes.STRING(50), allowNull: true },
      truck_no: { type: DataTypes.STRING(100), allowNull: false },
      trailer_no: { type: DataTypes.STRING(100), allowNull: true },
      driver_name: { type: DataTypes.STRING(255), allowNull: true },
      driver_mobile: { type: DataTypes.STRING(50), allowNull: true },
      transporter: { type: DataTypes.STRING(255), allowNull: true },
      license_number: { type: DataTypes.STRING(100), allowNull: true },
      vehicle_type: { type: DataTypes.STRING(100), allowNull: true },
      bag_bulk: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'Bag',
      },
      bags_count: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      loaded_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      loaded_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      avg_bag_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      seal_number: { type: DataTypes.STRING(100), allowNull: true },
      container_number: { type: DataTypes.STRING(100), allowNull: true },
      loading_location: { type: DataTypes.STRING(255), allowNull: true },
      stack_number: { type: DataTypes.STRING(100), allowNull: true },
      lot_number: { type: DataTypes.STRING(100), allowNull: true },
      batch_number: { type: DataTypes.STRING(100), allowNull: true },
      weighment_in_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      weighment_out_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      unload_location: { type: DataTypes.STRING(255), allowNull: true },
      unloaded_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      weight_difference: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      short_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      damage_qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      difference_reason: { type: DataTypes.TEXT, allowNull: true },
      variance_level: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Normal',
      },
      verification_status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Pending Verification',
      },
      unloading_date: { type: DataTypes.DATEONLY, allowNull: true },
      received_by: { type: DataTypes.STRING(255), allowNull: true },
      receiver_contact: { type: DataTypes.STRING(100), allowNull: true },
      eway_bill_no: { type: DataTypes.STRING(100), allowNull: true },
      lr_number: { type: DataTypes.STRING(100), allowNull: true },
      invoice_number: { type: DataTypes.STRING(100), allowNull: true },
      gate_pass_number: { type: DataTypes.STRING(100), allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      timeline: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Draft',
      },
      verified_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      approval_remarks: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize
    .query(
      `
    ALTER TABLE cargo_loading ALTER COLUMN cargo_availability_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cl_cargo_availability_id ON cargo_loading(cargo_availability_id);
    CREATE INDEX IF NOT EXISTS idx_cl_shipment_id ON cargo_loading(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_cl_truck_no ON cargo_loading(truck_no);
    CREATE INDEX IF NOT EXISTS idx_cl_status ON cargo_loading(status);
    CREATE INDEX IF NOT EXISTS idx_cl_loading_date ON cargo_loading(loading_date);
  `,
    )
    .catch(() => {});

  // 5. cargo_documents
  await queryInterface.createTable(
    'cargo_documents',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      cargo_loading_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'cargo_loading', key: 'id' },
        onDelete: 'CASCADE',
      },
      cargo_readiness_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'cargo_readiness', key: 'id' },
        onDelete: 'SET NULL',
      },
      document_type: { type: DataTypes.STRING(100), allowNull: false },
      file_name: { type: DataTypes.STRING(255), allowNull: false },
      file_path: { type: DataTypes.TEXT, allowNull: false },
      file_size: { type: DataTypes.INTEGER, allowNull: true },
      file_type: { type: DataTypes.STRING(100), allowNull: true },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      uploaded_at: { type: DataTypes.DATE, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_cd_cargo_loading_id ON cargo_documents(cargo_loading_id);
  `);

  console.log(
    '✅ Phase 25 - Cargo Availability & Loading Operations Module migrated successfully',
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('cargo_documents').catch(() => {});
  await queryInterface.dropTable('cargo_loading').catch(() => {});
  await queryInterface.dropTable('cargo_shipment_allocations').catch(() => {});
  await queryInterface.dropTable('cargo_readiness').catch(() => {});
  await queryInterface.dropTable('cargo_availability').catch(() => {});
  console.log('✅ Phase 25 - Cargo Availability tables dropped');
}
