import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '25';
export const name = 'Add weeklyOffDays to company_hr_policies';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface
    .addColumn('company_hr_policies', 'weeklyOffDays', {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [0, 6],
    })
    .catch(() => {
      // Column may already exist — ignore
    });

  console.log('✅ Phase 25 - weeklyOffDays column added to company_hr_policies');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface
    .removeColumn('company_hr_policies', 'weeklyOffDays')
    .catch(() => {});
}
