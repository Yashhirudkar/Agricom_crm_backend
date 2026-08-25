import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '13';
export const name = 'Quotations & Quotation Items';

export async function up(queryInterface: QueryInterface): Promise<void> {

  // ─── 1. quotation_sequences ───────────────────────────────────────────────
  // Atomic per-period counter for generating AQ-YYYYMM-NNNNNN numbers.
  await queryInterface.createTable(
    'quotation_sequences',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      period: { type: DataTypes.STRING(6), allowNull: false },
      last_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'last_seq' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('quotation_sequences', ['period'], {
      name: 'quotation_sequences_period_unique',
      unique: true,
    })
    .catch(() => {});

  // ─── 2. quotations ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'quotations',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      quotation_number: { type: DataTypes.STRING(30), allowNull: false, field: 'quotation_number' },

      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Draft' },

      buyer_id: {
        type: DataTypes.INTEGER, allowNull: false, field: 'buyer_id',
        references: { model: 'partners', key: 'id' }, onDelete: 'RESTRICT',
      },

      importer_id: {
        type: DataTypes.INTEGER, allowNull: true, field: 'importer_id',
        references: { model: 'partners', key: 'id' }, onDelete: 'SET NULL',
      },

      destination_country: { type: DataTypes.STRING(150), allowNull: false, field: 'destination_country' },

      follow_up_id: {
        type: DataTypes.INTEGER, allowNull: true, field: 'follow_up_id',
        references: { model: 'partner_followups', key: 'id' }, onDelete: 'SET NULL',
      },

      currency_code: { type: DataTypes.STRING(10), allowNull: false, field: 'currency_code' },

      valid_until: { type: DataTypes.DATEONLY, allowNull: true, field: 'valid_until' },

      // Audit: generation
      generated_by: {
        type: DataTypes.INTEGER, allowNull: true, field: 'generated_by',
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },
      generated_at: { type: DataTypes.DATE, allowNull: true, field: 'generated_at' },

      // Audit: last modification
      last_modified_by: {
        type: DataTypes.INTEGER, allowNull: true, field: 'last_modified_by',
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },
      last_modified_at: { type: DataTypes.DATE, allowNull: true, field: 'last_modified_at' },

      // Audit: creation
      created_by: {
        type: DataTypes.INTEGER, allowNull: true, field: 'created_by',
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },

      // Soft delete
      deleted_at: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
      deleted_by: {
        type: DataTypes.INTEGER, allowNull: true, field: 'deleted_by',
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL',
      },

      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // Unique constraint on quotation_number
  await queryInterface
    .addIndex('quotations', ['quotation_number'], {
      name: 'quotations_quotation_number_unique',
      unique: true,
    })
    .catch(() => {});

  await queryInterface
    .addIndex('quotations', ['buyer_id'], { name: 'quotations_buyer_id' })
    .catch(() => {});

  await queryInterface
    .addIndex('quotations', ['importer_id'], { name: 'quotations_importer_id' })
    .catch(() => {});

  await queryInterface
    .addIndex('quotations', ['follow_up_id'], { name: 'quotations_follow_up_id' })
    .catch(() => {});

  await queryInterface
    .addIndex('quotations', ['status'], { name: 'quotations_status' })
    .catch(() => {});

  await queryInterface
    .addIndex('quotations', ['deleted_at'], { name: 'quotations_deleted_at' })
    .catch(() => {});

  await queryInterface
    .addColumn('quotations', 'valid_until', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    })
    .catch(() => {});

  // ─── 3. quotation_items ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'quotation_items',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      quotation_id: {
        type: DataTypes.INTEGER, allowNull: false, field: 'quotation_id',
        references: { model: 'quotations', key: 'id' }, onDelete: 'CASCADE',
      },

      product_id: {
        type: DataTypes.INTEGER, allowNull: false, field: 'product_id',
        references: { model: 'products', key: 'id' }, onDelete: 'RESTRICT',
      },

      sub_type_spec: { type: DataTypes.STRING(255), allowNull: true, field: 'sub_type_spec' },

      packaging_id: {
        type: DataTypes.INTEGER, allowNull: true, field: 'packaging_id',
        references: { model: 'bag_specifications', key: 'id' }, onDelete: 'SET NULL',
      },

      packing_type_id: {
        type: DataTypes.INTEGER, allowNull: true, field: 'packing_type_id',
        references: { model: 'packing_types', key: 'id' }, onDelete: 'SET NULL',
      },

      purity: { type: DataTypes.STRING(100), allowNull: true },

      offered_price: { type: DataTypes.DECIMAL(15, 4), allowNull: false, field: 'offered_price' },

      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },

      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('quotation_items', ['quotation_id'], { name: 'quotation_items_quotation_id' })
    .catch(() => {});

  await queryInterface
    .addIndex('quotation_items', ['product_id'], { name: 'quotation_items_product_id' })
    .catch(() => {});

  console.log('✅ Phase 13 - Quotations & Quotation Items tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('quotation_items').catch(() => {});
  await queryInterface.dropTable('quotations').catch(() => {});
  await queryInterface.dropTable('quotation_sequences').catch(() => {});
  console.log('✅ Phase 13 - Quotation tables dropped');
}
