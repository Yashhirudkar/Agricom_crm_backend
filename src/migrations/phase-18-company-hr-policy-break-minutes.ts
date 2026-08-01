import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '18';
export const name = 'Add defaultBreakMinutes to company_hr_policies';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('company_hr_policies', 'defaultBreakMinutes', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('company_hr_policies', 'defaultBreakMinutes').catch(() => {});
}
