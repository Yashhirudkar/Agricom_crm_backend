import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '33';
export const name = 'Remove biometricUserId column and index from employees table';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Drop index from employees table
  await queryInterface.removeIndex('employees', 'idx_employees_company_biometric_user').catch(() => {});

  // 2. Remove column from employees table
  await queryInterface.removeColumn('employees', 'biometricUserId').catch(() => {});

  console.log('✅ Phase 33 - biometricUserId column and index removed from employees');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // 1. Add column back
  await queryInterface.addColumn('employees', 'biometricUserId', {
    type: DataTypes.STRING(100),
    allowNull: true,
  }).catch(() => {});

  // 2. Add unique index back
  await queryInterface.addIndex('employees', ['companyId', 'biometricUserId'], {
    name: 'idx_employees_company_biometric_user',
    unique: true,
  }).catch(() => {});

  console.log('📉 Phase 33 - biometricUserId column and index added back to employees');
}
