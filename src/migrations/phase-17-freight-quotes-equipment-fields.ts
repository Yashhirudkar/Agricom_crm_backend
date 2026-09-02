import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '17';
export const name = 'Add equipment truck and wagon fields to freight_quotes table';

export async function up(queryInterface: QueryInterface): Promise<void> {
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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('freight_quotes', 'truck_type').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'truck_capacity').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'wagon_type').catch(() => { });
  await queryInterface.removeColumn('freight_quotes', 'wagon_capacity').catch(() => { });
}
