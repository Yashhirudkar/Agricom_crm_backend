import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '06';
export const name = 'Attendance Tables (attendance_records, attendance_logs, attendance_exceptions, company_break_policies)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. company_break_policies ───────────────────────────────────────────────
  await queryInterface.createTable(
    'company_break_policies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      startTime: { type: DataTypes.STRING(50), allowNull: false, field: 'startTime' },
      durationMinutes: { type: DataTypes.INTEGER, allowNull: false, field: 'durationMinutes' },
      isAutomatic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isAutomatic' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('company_break_policies', ['companyId'], { name: 'company_break_policies_company_id' })
    .catch(() => {});

  // ─── 2. attendance_records ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'attendance_records',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      checkInTime: { type: DataTypes.DATE, allowNull: true, field: 'checkInTime' },
      checkOutTime: { type: DataTypes.DATE, allowNull: true, field: 'checkOutTime' },
      totalHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: 0, field: 'totalHours' },
      overtimeHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: 0, field: 'overtimeHours' },
      lateMinutes: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0, field: 'lateMinutes' },
      attendanceState: {
        type: DataTypes.ENUM('NOT_CHECKED_IN', 'WORKING', 'ON_BREAK', 'CHECKED_OUT'),
        allowNull: false,
        defaultValue: 'NOT_CHECKED_IN',
        field: 'attendanceState'
      },
      attendanceStatus: {
        type: DataTypes.ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'WEEK_OFF', 'ON_LEAVE', 'HOLIDAY', 'UPCOMING'),
        allowNull: true,
        field: 'attendanceStatus'
      },
      attendanceSource: {
        type: DataTypes.ENUM('SELF_PUNCH', 'ADMIN_MARKED', 'REGULARIZATION_APPROVED', 'AUTO_BREAK_SYSTEM', 'BIOMETRIC', 'API_IMPORT'),
        allowNull: false,
        defaultValue: 'SELF_PUNCH',
        field: 'attendanceSource'
      },
      locationLat: { type: DataTypes.DECIMAL(10, 8), allowNull: true, field: 'locationLat' },
      locationLng: { type: DataTypes.DECIMAL(11, 8), allowNull: true, field: 'locationLng' },
      shiftId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'shiftId',
        references: { model: 'shifts', key: 'id' },
        onDelete: 'SET NULL',
      },
      isPayrollLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isPayrollLocked' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('attendance_records', ['employeeId', 'date'], { name: 'attendance_records_employee_date', unique: true })
    .catch(() => {});
  await queryInterface
    .addIndex('attendance_records', ['companyId', 'date'], { name: 'attendance_records_company_date' })
    .catch(() => {});

  // ─── 3. attendance_logs ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'attendance_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      attendanceRecordId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'attendanceRecordId',
        references: { model: 'attendance_records', key: 'id' },
        onDelete: 'SET NULL',
      },
      timestamp: { type: DataTypes.DATE, allowNull: false, field: 'timestamp' },
      actionType: {
        type: DataTypes.ENUM('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END', 'AUTO_CORRECTION', 'REGULARIZATION_APPROVED', 'ADMIN_MARKED'),
        allowNull: false,
        field: 'actionType'
      },
      metadata: { type: DataTypes.JSON, allowNull: true, field: 'metadata' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 4. attendance_exceptions ────────────────────────────────────────────────
  await queryInterface.createTable(
    'attendance_exceptions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      attendanceRecordId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'attendanceRecordId',
        references: { model: 'attendance_records', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: {
        type: DataTypes.ENUM('MISSED_PUNCH', 'MANUAL_ENTRY', 'REGULARIZATION', 'OVERRIDE'),
        allowNull: false,
      },
      reason: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      approvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'approvedBy',
        references: { model: 'employees', key: 'id' },
        onDelete: 'SET NULL',
      },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 06 - Attendance tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('attendance_exceptions').catch(() => {});
  await queryInterface.dropTable('attendance_logs').catch(() => {});
  await queryInterface.dropTable('attendance_records').catch(() => {});
  await queryInterface.dropTable('company_break_policies').catch(() => {});
  console.log('✅ Phase 06 - Attendance tables dropped');
}

