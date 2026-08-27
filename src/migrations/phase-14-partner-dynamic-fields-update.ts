import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '14';
export const name = 'Add product_notes to partners, and values_json + schema_version to partner_dynamic_values';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add product_notes to partners table if missing
  await queryInterface.addColumn('partners', 'product_notes', {
    type: DataTypes.TEXT,
    allowNull: true,
  }).catch(() => { });

  // 2. Add values_json to partner_dynamic_values table if missing
  await queryInterface.addColumn('partner_dynamic_values', 'values_json', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  }).catch(() => { });

  // 3. Add schema_version to partner_dynamic_values table if missing
  await queryInterface.addColumn('partner_dynamic_values', 'schema_version', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  }).catch(() => { });

  // 4. Ensure partner_dynamic_values_partner_config_unique index
  await queryInterface.addIndex('partner_dynamic_values', ['partner_id', 'config_id'], {
    name: 'partner_dynamic_values_partner_config_unique',
    unique: true,
  }).catch(() => { });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('partners', 'product_notes').catch(() => { });
  await queryInterface.removeColumn('partner_dynamic_values', 'values_json').catch(() => { });
  await queryInterface.removeColumn('partner_dynamic_values', 'schema_version').catch(() => { });
}
