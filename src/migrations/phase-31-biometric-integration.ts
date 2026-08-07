import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '31';
export const name = 'Add Biometric Integration tables and columns';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const addCol = async (table: string, colName: string, spec: any) => {
    await queryInterface.addColumn(table, colName, spec).catch(() => {});
  };

  // 1. Add column to employees
  await addCol('employees', 'biometricUserId', {
    type: DataTypes.STRING(100),
    allowNull: true,
  });

  // Add unique index on employees (companyId, biometricUserId)
  await queryInterface.addIndex('employees', ['companyId', 'biometricUserId'], {
    name: 'idx_employees_company_biometric_user',
    unique: true,
  }).catch(() => {});

  // 2. Add columns to company_hr_policies
  await addCol('company_hr_policies', 'biometricEnabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await addCol('company_hr_policies', 'manualAttendanceAllowed', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });

  await addCol('company_hr_policies', 'mixedAttendanceAllowed', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });

  await addCol('company_hr_policies', 'requireBiometricCheckout', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await addCol('company_hr_policies', 'allowMobileCheckin', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // 3. Add column to attendance_records
  await addCol('attendance_records', 'revision', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });

  // 4. Create biometric_devices table
  await queryInterface.createTable('biometric_devices', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    branchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onDelete: 'SET NULL',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4370,
    },
    serialNumber: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    secretKey: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'OFFLINE',
    },
    lastHeartbeat: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastLogId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    timeOffset: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }).catch(() => {});

  // 5. Create biometric_punch_logs table
  await queryInterface.createTable('biometric_punch_logs', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    deviceSerialNumber: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    deviceLogId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    biometricUserId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    serverReceivedTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processedTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    punchType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    processedRecordId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'attendance_records', key: 'id' },
      onDelete: 'SET NULL',
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }).catch(() => {});

  // Add unique constraint index for idempotency on biometric_punch_logs
  await queryInterface.addIndex('biometric_punch_logs', ['deviceSerialNumber', 'deviceLogId'], {
    name: 'idx_biometric_punches_idemp',
    unique: true,
  }).catch(() => {});

  // Add search status index on biometric_punch_logs
  await queryInterface.addIndex('biometric_punch_logs', ['status', 'companyId'], {
    name: 'idx_biometric_punches_status',
  }).catch(() => {});

  // 6. Create attendance_audit_trails table
  await queryInterface.createTable('attendance_audit_trails', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    attendanceRecordId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'attendance_records', key: 'id' },
      onDelete: 'CASCADE',
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
      onDelete: 'CASCADE',
    },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'employees', key: 'id' },
      onDelete: 'CASCADE',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    revisionNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    originalValue: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    changedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }).catch(() => {});

  console.log('✅ Phase 31 - Biometric Integration tables and columns added');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop tables in reverse order
  await queryInterface.dropTable('attendance_audit_trails').catch(() => {});
  await queryInterface.dropTable('biometric_punch_logs').catch(() => {});
  await queryInterface.dropTable('biometric_devices').catch(() => {});

  // Remove columns from tables
  await queryInterface.removeColumn('employees', 'biometricUserId').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'biometricEnabled').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'manualAttendanceAllowed').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'mixedAttendanceAllowed').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'requireBiometricCheckout').catch(() => {});
  await queryInterface.removeColumn('company_hr_policies', 'allowMobileCheckin').catch(() => {});
  await queryInterface.removeColumn('attendance_records', 'revision').catch(() => {});

  console.log('📉 Phase 31 - Biometric Integration tables and columns rolled back');
}
