import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '30';
export const name = 'Add Enterprise Attendance Policy columns to company_hr_policies';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const table = 'company_hr_policies';

  const addCol = async (colName: string, spec: any) => {
    await queryInterface.addColumn(table, colName, spec).catch(() => {});
  };

  await addCol('monthlyLateThreshold', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
  });

  await addCol('latePenaltyAction', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'HALF_DAY',
  });

  await addCol('halfDayAfterTime', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '11:00',
  });

  await addCol('absentAfterTime', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '13:30',
  });

  await addCol('checkoutGraceMinutes', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  });

  await addCol('autoCheckoutTime', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '23:59',
  });

  await addCol('overtimeStartAfter', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });

  console.log('✅ Phase 30 - Enterprise Attendance Policy columns added to company_hr_policies');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const table = 'company_hr_policies';
  const removeCol = async (colName: string) => {
    await queryInterface.removeColumn(table, colName).catch(() => {});
  };

  await removeCol('monthlyLateThreshold');
  await removeCol('latePenaltyAction');
  await removeCol('halfDayAfterTime');
  await removeCol('absentAfterTime');
  await removeCol('checkoutGraceMinutes');
  await removeCol('autoCheckoutTime');
  await removeCol('overtimeStartAfter');
}
