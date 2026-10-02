import { QueryInterface, DataTypes } from 'sequelize';
import { DEFAULT_EQUIPMENT_SEED } from '../masters/equipment-option/equipment-option.service';

export const phase = '17';
export const name = 'freight-combined-migrations';

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
  // --- From 17 ---
  await queryInterface.addColumn('freight_quotes', 'contact_person', {
    type: DataTypes.STRING(100),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('freight_quotes', 'truck_type', {
    type: DataTypes.STRING(50),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('freight_quotes', 'truck_capacity', {
    type: DataTypes.STRING(50),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('freight_quotes', 'wagon_type', {
    type: DataTypes.STRING(50),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('freight_quotes', 'wagon_capacity', {
    type: DataTypes.STRING(50),
    allowNull: true,
  }).catch(() => { });

  // --- From 18 ---
  await queryInterface.createTable('equipment_options', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    value: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
  }, { ifNotExists: true } as any).catch(() => { });

  await queryInterface.addIndex('equipment_options', ['category']).catch(() => { });
  await queryInterface.addIndex('equipment_options', ['is_active']).catch(() => { });

  const rows: any[] = [];
  const now = new Date();
  for (const [category, values] of Object.entries(DEFAULT_EQUIPMENT_SEED)) {
    values.forEach((value, idx) => {
      rows.push({
        category,
        value,
        display_order: idx + 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    });
  }

  if (rows.length > 0) {
    await queryInterface.bulkInsert('equipment_options', rows).catch(() => { });
  }

  // --- From 22 ---
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
  }, { ifNotExists: true } as any).catch(() => { });

  await queryInterface.addIndex('freight_charge_master', ['mode'], {
    name: 'idx_freight_charge_master_mode',
  }).catch(() => { });
  
  await queryInterface.addIndex('freight_charge_master', ['mode', 'charge_name'], {
    name: 'idx_freight_charge_master_mode_name',
    unique: true,
  }).catch(() => { });

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
  }, { ifNotExists: true } as any).catch(() => { });

  await queryInterface.addIndex('freight_quote_charges', ['quote_id'], {
    name: 'idx_freight_quote_charges_quote_id',
  }).catch(() => { });

  const freightRows: any[] = [];
  const seedMode = (mode: string, charges: { name: string; code: string; isDefault: boolean }[]) => {
    charges.forEach((item, idx) => {
      freightRows.push({
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

  if (freightRows.length > 0) {
    await queryInterface.bulkInsert('freight_charge_master', freightRows).catch(() => { });
  }

  // --- From 23 ---
  const sequelize = queryInterface.sequelize;
  const [logisticsFolder]: any = await sequelize.query(`
    SELECT id FROM sidebar_folders WHERE name = 'Logistics' LIMIT 1;
  `).catch(() => [[]]);

  if (logisticsFolder && logisticsFolder.length > 0) {
    const folderId = logisticsFolder[0].id;
    const [existingItem]: any = await sequelize.query(`
      SELECT id FROM sidebar_items WHERE route = '/logistics/freight-management' LIMIT 1;
    `).catch(() => [[]]);

    let itemId: number = 0;
    if (existingItem && existingItem.length > 0) {
      itemId = existingItem[0].id;
      await sequelize.query(
        `UPDATE sidebar_items
         SET name = 'Freight Management', folder_id = :folderId, sort_order = 20,
             icon_name = 'Package', permission_link = 'logistics:view', "updatedAt" = NOW()
         WHERE id = :itemId;`,
        { replacements: { folderId, itemId } },
      ).catch(() => {});
    } else {
      const [insertItemRes]: any = await sequelize.query(
        `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
         VALUES ('Freight Management', '/logistics/freight-management', 'Package', :folderId, 20, true, 'logistics:view', NOW(), NOW())
         RETURNING id;`,
        { replacements: { folderId } },
      ).catch(() => [[]]);
      if (insertItemRes && insertItemRes.length > 0) itemId = insertItemRes[0].id;
    }

    if (itemId) {
      const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`).catch(() => [[]]);
      const clientIds = clientsRes ? clientsRes.map((r: any) => r.id) : [];

      for (const clientId of clientIds) {
        const [hasItemAccess]: any = await sequelize.query(
          `SELECT id FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId;`,
          { replacements: { clientId, itemId } },
        ).catch(() => [[]]);
        
        if (hasItemAccess && hasItemAccess.length === 0) {
          await sequelize.query(
            `INSERT INTO client_item_access (client_id, item_id, created_at)
             VALUES (:clientId, :itemId, NOW());`,
            { replacements: { clientId, itemId } },
          ).catch(() => {});
        }
      }
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  // From 23
  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/logistics/freight-management');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/logistics/freight-management';`).catch(() => { });

  // From 22
  await queryInterface.dropTable('freight_quote_charges').catch(() => { });
  await queryInterface.dropTable('freight_charge_master').catch(() => { });

  // From 18
  await queryInterface.dropTable('equipment_options').catch(() => { });

  // From 17
  await queryInterface.removeColumn('freight_quotes', 'truck_type').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'truck_capacity').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'wagon_type').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'wagon_capacity').catch(() => { });
}
