import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '16';
export const name = 'Add logistics zip and station code fields to enquiries';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('enquiries', 'origin_zip_code', {
    type: DataTypes.STRING(20),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('enquiries', 'destination_zip_code', {
    type: DataTypes.STRING(20),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('enquiries', 'origin_station_code', {
    type: DataTypes.STRING(20),
    allowNull: true,
  }).catch(() => { });

  await queryInterface.addColumn('enquiries', 'destination_station_code', {
    type: DataTypes.STRING(20),
    allowNull: true,
  }).catch(() => { });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('enquiries', 'origin_zip_code').catch(() => { });
  await queryInterface.removeColumn('enquiries', 'destination_zip_code').catch(() => { });
  await queryInterface.removeColumn('enquiries', 'origin_station_code').catch(() => { });
  await queryInterface.removeColumn('enquiries', 'destination_station_code').catch(() => { });
}
