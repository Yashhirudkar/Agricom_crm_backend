import { QueryInterface, DataTypes } from 'sequelize';
import { DEFAULT_EQUIPMENT_SEED } from '../masters/equipment-option/equipment-option.service';

export const phase = '18';
export const name = 'Create equipment_options master table and populate seed defaults';

export async function up(queryInterface: QueryInterface): Promise<void> {
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
  }).catch(() => { });

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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('equipment_options').catch(() => { });
}
