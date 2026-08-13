import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '03';
export const name = 'Attendance & Leave Management Architecture';

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
    .catch(() => { });

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
      isConflict: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isConflict' },
      isIgnored: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isIgnored' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('attendance_records', ['employeeId', 'date'], { name: 'attendance_records_employee_date', unique: true })
    .catch(() => { });
  await queryInterface
    .addIndex('attendance_records', ['companyId', 'date'], { name: 'attendance_records_company_date' })
    .catch(() => { });

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

  // ─── 4. leave_types ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_types',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      code: { type: DataTypes.STRING(20), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      daysPerYear: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'daysPerYear' },
      isPaid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isPaid' },
      isCarryForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isCarryForward' },
      maxCarryForwardDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'maxCarryForwardDays' },
      isEncashable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isEncashable' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 5. leave_allocations ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_allocations',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      leaveTypeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'leaveTypeId',
        references: { model: 'leave_types', key: 'id' },
        onDelete: 'CASCADE',
      },
      year: { type: DataTypes.INTEGER, allowNull: false },
      allocatedDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'allocatedDays' },
      usedDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'usedDays' },
      pendingDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'pendingDays' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. leave_applications ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_applications',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      leaveTypeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'leaveTypeId',
        references: { model: 'leave_types', key: 'id' },
        onDelete: 'CASCADE',
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'startDate' },
      endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'endDate' },
      totalDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'totalDays' },
      reason: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 7. attendance_exceptions ────────────────────────────────────────────────
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
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      attendanceRecordId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'attendanceRecordId',
        references: { model: 'attendance_records', key: 'id' },
        onDelete: 'SET NULL',
      },
      attendanceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'attendanceId',
        references: { model: 'attendance_records', key: 'id' },
        onDelete: 'SET NULL',
      },
      leaveId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'leaveId',
        references: { model: 'leave_applications', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: { type: DataTypes.STRING(100), allowNull: true },
      exceptionType: { type: DataTypes.STRING(100), allowNull: true, field: 'exceptionType' },
      reason: { type: DataTypes.TEXT, allowNull: true },
      resolution: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'MEDIUM',
      },
      conflictRef: { type: DataTypes.STRING(50), allowNull: true, unique: true, field: 'conflictRef' },
      approvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'approvedBy',
        references: { model: 'employees', key: 'id' },
        onDelete: 'SET NULL',
      },
      resolvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'resolvedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolvedAt' },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 03 - Attendance & Leave Management tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('attendance_exceptions').catch(() => { });
  await queryInterface.dropTable('leave_applications').catch(() => { });
  await queryInterface.dropTable('leave_allocations').catch(() => { });
  await queryInterface.dropTable('leave_types').catch(() => { });
  await queryInterface.dropTable('attendance_logs').catch(() => { });
  await queryInterface.dropTable('attendance_records').catch(() => { });
  await queryInterface.dropTable('company_break_policies').catch(() => { });
  console.log('✅ Phase 03 - Attendance & Leave Management tables dropped');
}
