import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '19';
export const name = 'Add defaultBreakStartTime and defaultBreakEndTime to company_hr_policies';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('company_hr_policies', 'defaultBreakStartTime', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '13:00',
  }).catch(() => {});

  await queryInterface.addColumn('company_hr_policies', 'defaultBreakEndTime', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '13:30',
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('company_hr_policies', 'defaultBreakStartTime').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'defaultBreakEndTime').catch(() => {});
}
