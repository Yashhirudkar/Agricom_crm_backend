import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '22';
export const name = 'Create freight_charge_master and freight_quote_charges tables and seed default charges';

export const DEFAULT_ROAD_CHARGES = [
  { name: 'Basic Freight', code: 'BASIC', isDefault: true },
  { name: 'Loading Charges', code: 'LOADING', isDefault: false },
  { name: 'Unloading Charges', code: 'UNLOADING', isDefault: false },
  { name: 'Toll Charges', code: 'TOLL', isDefault: false },
  { name: 'Documentation Charges', code: 'DOC', isDefault: false },
  { name: 'Fuel Surcharge (FSC)', code: 'FSC', isDefault: false },
  { name: 'Handling Charges', code: 'HANDLING', isDefault: false },
  { name: 'Insurance', code: 'INSURANCE', isDefault: false },
  { name: 'Waiting / Detention Charges', code: 'DETENTION', isDefault: false },
  { name: 'Warehouse Charges', code: 'WAREHOUSE', isDefault: false },
  { name: 'GST', code: 'GST', isDefault: false },
];

export const DEFAULT_SEA_CHARGES = [
  { name: 'Ocean Freight', code: 'OFRT', isDefault: true },
  { name: 'THC (Terminal Handling Charges)', code: 'THC', isDefault: false },
  { name: 'Documentation Charges', code: 'DOC', isDefault: false },
  { name: 'ISPS Charges', code: 'ISPS', isDefault: false },
  { name: 'Seal Charges', code: 'SEAL', isDefault: false },
  { name: 'Detention Charges', code: 'DET', isDefault: false },
  { name: 'Demurrage Charges', code: 'DEM', isDefault: false },
];

export const DEFAULT_RAIL_CHARGES = [
  { name: 'Basic Freight', code: 'BASIC', isDefault: true },
  { name: 'Loading Charges', code: 'LOADING', isDefault: false },
  { name: 'Unloading Charges', code: 'UNLOADING', isDefault: false },
  { name: 'Handling Charges', code: 'HANDLING', isDefault: false },
  { name: 'Documentation Charges', code: 'DOC', isDefault: false },
  { name: 'Wagon Detention Charges', code: 'DET', isDefault: false },
  { name: 'Insurance', code: 'INSURANCE', isDefault: false },
  { name: 'GST', code: 'GST', isDefault: false },
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Create freight_charge_master table
  await queryInterface.createTable('freight_charge_master', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    mode: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    charge_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    charge_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }).catch(() => { });

  await queryInterface.addIndex('freight_charge_master', ['mode'], {
    name: 'idx_freight_charge_master_mode',
  }).catch(() => { });
  
  await queryInterface.addIndex('freight_charge_master', ['mode', 'charge_name'], {
    name: 'idx_freight_charge_master_mode_name',
    unique: true,
  }).catch(() => { });

  // 2. Create freight_quote_charges table
  await queryInterface.createTable('freight_quote_charges', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'freight_quotes',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    charge_master_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'freight_charge_master',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    charge_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(15, 4),
      allowNull: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }).catch(() => { });

  await queryInterface.addIndex('freight_quote_charges', ['quote_id'], {
    name: 'idx_freight_quote_charges_quote_id',
  }).catch(() => { });

  // 3. Seed default charges
  const rows: any[] = [];
  const now = new Date();

  const seedMode = (mode: string, charges: { name: string; code: string; isDefault: boolean }[]) => {
    charges.forEach((item, idx) => {
      rows.push({
        mode,
        charge_name: item.name,
        charge_code: item.code,
        display_order: idx + 1,
        is_default: item.isDefault,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    });
  };

  seedMode('Road', DEFAULT_ROAD_CHARGES);
  seedMode('Sea', DEFAULT_SEA_CHARGES);
  seedMode('Rail', DEFAULT_RAIL_CHARGES);

  if (rows.length > 0) {
    await queryInterface.bulkInsert('freight_charge_master', rows).catch(() => { });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('freight_quote_charges').catch(() => { });
  await queryInterface.dropTable('freight_charge_master').catch(() => { });
}
