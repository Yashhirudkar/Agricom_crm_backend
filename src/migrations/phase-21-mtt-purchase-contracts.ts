import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '21';
export const name = 'Manual Purchase Contract (MTT) & Product Items';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Make sales_contract_id nullable & add manual MTT header fields
  await sequelize.query(`
    ALTER TABLE purchase_contracts
    ALTER COLUMN sales_contract_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(30) DEFAULT 'SC',
    ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS buyer_id INTEGER,
    ADD COLUMN IF NOT EXISTS seller_id INTEGER,
    ADD COLUMN IF NOT EXISTS payment_term_id INTEGER,
    ADD COLUMN IF NOT EXISTS broker_id INTEGER,
    ADD COLUMN IF NOT EXISTS broker_commission VARCHAR(100),
    ADD COLUMN IF NOT EXISTS dispatch_date DATE;
  `);

  // 2. Create purchase_contract_items table
  await queryInterface.createTable(
    'purchase_contract_items',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      purchase_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchase_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'products', key: 'id' },
        onDelete: 'RESTRICT',
      },
      product_name: { type: DataTypes.STRING(255), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      product_quality: { type: DataTypes.STRING(255), allowNull: true },
      packing: { type: DataTypes.STRING(100), allowNull: true },
      bag_type: { type: DataTypes.STRING(100), allowNull: true },
      bag_spec: { type: DataTypes.STRING(100), allowNull: true },
      stitching: { type: DataTypes.STRING(100), allowNull: true },
      marking: { type: DataTypes.STRING(100), allowNull: true },
      rate_per_mt: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pci_purchase_contract_id
    ON purchase_contract_items (purchase_contract_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pci_product_id
    ON purchase_contract_items (product_id);
  `);

  // 3. Add item link & partial allocation quantity to purchase_contract_shipments
  await sequelize.query(`
    ALTER TABLE purchase_contract_shipments
    ADD COLUMN IF NOT EXISTS purchase_contract_item_id INTEGER REFERENCES purchase_contract_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS allocated_quantity DECIMAL(12, 2);
  `);

  console.log('✅ Phase 21 - Manual Purchase Contract (MTT) & Product Items migrated successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(`
    ALTER TABLE purchase_contract_shipments
    DROP COLUMN IF EXISTS purchase_contract_item_id,
    DROP COLUMN IF EXISTS allocated_quantity;
  `).catch(() => {});

  await queryInterface.dropTable('purchase_contract_items').catch(() => {});

  await sequelize.query(`
    ALTER TABLE purchase_contracts
    DROP COLUMN IF EXISTS buyer_id,
    DROP COLUMN IF EXISTS seller_id,
    DROP COLUMN IF EXISTS contract_number,
    DROP COLUMN IF EXISTS payment_term_id,
    DROP COLUMN IF EXISTS broker_id,
    DROP COLUMN IF EXISTS broker_commission,
    DROP COLUMN IF EXISTS dispatch_date;
  `).catch(() => {});

  console.log('✅ Phase 21 - Manual Purchase Contract (MTT) dropped');
}
