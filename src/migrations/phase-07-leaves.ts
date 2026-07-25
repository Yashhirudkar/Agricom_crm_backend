import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '07';
export const name = 'Leave Management Tables (leave_types, leave_requests, leave_approval_steps, leave_approval_logs, employee_leave_balances, leave_balance_history)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. leave_types ──────────────────────────────────────────────────────────
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
      code: { type: DataTypes.STRING(50), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      daysPerYear: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'daysPerYear' },
      minimumServiceDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'minimumServiceDays' },
      applicableAfterProbation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'applicableAfterProbation' },
      encashable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      carryForwardAllowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'carryForwardAllowed' },
      maxCarryForwardDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'maxCarryForwardDays' },
      requiresApproval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'requiresApproval' },
      isPaid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isPaid' },
      allowHalfDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'allowHalfDay' },
      genderRestriction: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: true, field: 'genderRestriction' },
      maritalRestriction: { type: DataTypes.ENUM('MARRIED', 'UNMARRIED'), allowNull: true, field: 'maritalRestriction' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'createdBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'updatedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('leave_types', ['companyId'], { name: 'leave_types_company_id' })
    .catch(() => {});
  await queryInterface
    .addIndex('leave_types', ['companyId', 'code'], { name: 'leave_types_company_code_unique', unique: true })
    .catch(() => {});

  // ─── 2. leave_requests ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_requests',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
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
      fromDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'fromDate' },
      toDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'toDate' },
      totalDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'totalDays' },
      isHalfDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isHalfDay' },
      halfDayType: { type: DataTypes.ENUM('FIRST_HALF', 'SECOND_HALF'), allowNull: true, field: 'halfDayType' },
      reason: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      attachmentPath: { type: DataTypes.STRING(1000), allowNull: true, field: 'attachmentPath' },
      mimeType: { type: DataTypes.STRING(100), allowNull: true, field: 'mimeType' },
      fileSize: { type: DataTypes.INTEGER, allowNull: true, field: 'fileSize' },
      currentApprovalLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'currentApprovalLevel' },
      finalApprovalLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'finalApprovalLevel' },
      rejectedReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejectedReason' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('leave_requests', ['employeeId', 'status'], { name: 'leave_requests_employee_status' })
    .catch(() => {});
  await queryInterface
    .addIndex('leave_requests', ['employeeId', 'fromDate', 'toDate'], { name: 'leave_requests_employee_dates' })
    .catch(() => {});

  // ─── 3. leave_approval_steps ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_approval_steps',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      leaveRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'leaveRequestId',
        references: { model: 'leave_requests', key: 'id' },
        onDelete: 'CASCADE',
      },
      approvalLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'approvalLevel' },
      approverId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'approverId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'PENDING' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 4. leave_approval_logs ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_approval_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      leaveRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'leaveRequestId',
        references: { model: 'leave_requests', key: 'id' },
        onDelete: 'CASCADE',
      },
      approverId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'approverId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: { type: DataTypes.STRING(50), allowNull: false },
      approvalLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'approvalLevel' },
      comments: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 5. employee_leave_balances ──────────────────────────────────────────────
  await queryInterface.createTable(
    'employee_leave_balances',
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
      allocated: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      used: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      pending: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      carryForward: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'carryForward' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. leave_balance_history ────────────────────────────────────────────────
  await queryInterface.createTable(
    'leave_balance_history',
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
      changeType: { type: DataTypes.STRING(50), allowNull: false, field: 'changeType' },
      changeDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'changeDays' },
      balanceBefore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'balanceBefore' },
      balanceAfter: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'balanceAfter' },
      reason: { type: DataTypes.TEXT, allowNull: true },
      changedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'changedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      leaveRequestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'leaveRequestId',
        references: { model: 'leave_requests', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 07 - Leave management tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('leave_balance_history').catch(() => {});
  await queryInterface.dropTable('employee_leave_balances').catch(() => {});
  await queryInterface.dropTable('leave_approval_logs').catch(() => {});
  await queryInterface.dropTable('leave_approval_steps').catch(() => {});
  await queryInterface.dropTable('leave_requests').catch(() => {});
  await queryInterface.dropTable('leave_types').catch(() => {});
  console.log('✅ Phase 07 - Leave management tables dropped');
}

