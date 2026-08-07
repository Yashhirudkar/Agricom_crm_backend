import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '31';
export const name = 'Add mandatoryBreakDeduction column to company_hr_policies';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const table = 'company_hr_policies';

  const addCol = async (colName: string, spec: any) => {
    await queryInterface.addColumn(table, colName, spec).catch(() => {});
  };

  await addCol('mandatoryBreakDeduction', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  console.log('✅ Phase 31 - mandatoryBreakDeduction column added to company_hr_policies');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const table = 'company_hr_policies';
  await queryInterface.removeColumn(table, 'mandatoryBreakDeduction').catch(() => {});
}
