import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '02';
export const name = 'HRMS & Company HR Policies Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. branches ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'branches',
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
      code: { type: DataTypes.STRING(50), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      isHeadOffice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isHeadOffice' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 2. designations ─────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'designations',
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
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 3. shifts ───────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'shifts',
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
      endTime: { type: DataTypes.STRING(50), allowNull: false, field: 'endTime' },
      breakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'breakMinutes' },
      gracePeriodMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'gracePeriodMinutes' },
      isNightShift: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isNightShift' },
      weeklyOffDays: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'weeklyOffDays' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('shifts', ['companyId'], { name: 'shifts_company_id' }).catch(() => { });

  // ─── 4. employees ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'employees',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      firstName: { type: DataTypes.STRING(100), allowNull: false, field: 'firstName' },
      middleName: { type: DataTypes.STRING(100), allowNull: true, field: 'middleName' },
      lastName: { type: DataTypes.STRING(100), allowNull: false, field: 'lastName' },
      dob: { type: DataTypes.DATEONLY, allowNull: true },
      gender: { type: DataTypes.STRING(20), allowNull: true },
      bloodGroup: { type: DataTypes.STRING(10), allowNull: true, field: 'bloodGroup' },
      maritalStatus: { type: DataTypes.STRING(50), allowNull: true, field: 'maritalStatus' },
      nationality: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: false },
      personalEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'personalEmail' },
      mobile: { type: DataTypes.STRING(20), allowNull: true },
      alternatePhone: { type: DataTypes.STRING(20), allowNull: true, field: 'alternatePhone' },
      emergencyContactName: { type: DataTypes.STRING(100), allowNull: true, field: 'emergencyContactName' },
      emergencyContactNumber: { type: DataTypes.STRING(20), allowNull: true, field: 'emergencyContactNumber' },
      emergencyContactRelation: { type: DataTypes.STRING(50), allowNull: true, field: 'emergencyContactRelation' },
      address: { type: DataTypes.TEXT, allowNull: true },
      currentAddress: { type: DataTypes.TEXT, allowNull: true, field: 'currentAddress' },
      permanentAddress: { type: DataTypes.TEXT, allowNull: true, field: 'permanentAddress' },
      city: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },
      employeeCode: { type: DataTypes.STRING(100), allowNull: false, field: 'employeeCode' },
      departmentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'departmentId',
        references: { model: 'departments', key: 'id' },
        onDelete: 'SET NULL',
      },
      designationId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'designationId',
        references: { model: 'designations', key: 'id' },
        onDelete: 'SET NULL',
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'branchId',
        references: { model: 'branches', key: 'id' },
        onDelete: 'SET NULL',
      },
      managerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'managerId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'SET NULL',
      },
      joiningDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'joiningDate' },
      probationEndDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'probationEndDate' },
      confirmationDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'confirmationDate' },
      workLocation: { type: DataTypes.STRING(100), allowNull: true, field: 'workLocation' },
      workMode: { type: DataTypes.ENUM('REMOTE', 'HYBRID', 'OFFICE'), allowNull: true, field: 'workMode' },
      employmentType: {
        type: DataTypes.ENUM('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACT', 'CONSULTANT'),
        allowNull: false,
        field: 'employmentType',
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'ONBOARDING', 'PROBATION', 'ACTIVE', 'CONFIRMED', 'NOTICE_PERIOD', 'RESIGNED', 'TERMINATED'),
        allowNull: false,
      },
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
      shiftId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'shiftId',
        references: { model: 'shifts', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('employees', ['companyId'], { name: 'employees_company_id' }).catch(() => { });
  await queryInterface.addIndex('employees', ['userId'], { name: 'employees_user_id' }).catch(() => { });
  await queryInterface.addIndex('employees', ['managerId'], { name: 'employees_manager_id' }).catch(() => { });
  await queryInterface
    .addIndex('employees', ['companyId', 'employeeCode'], { name: 'employees_company_code_unique', unique: true })
    .catch(() => { });

  // ─── 5. employee_documents ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'employee_documents',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      documentType: { type: DataTypes.STRING(100), allowNull: false, field: 'documentType' },
      documentNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'documentNumber' },
      filePath: { type: DataTypes.STRING(1000), allowNull: true, field: 'filePath' },
      fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'fileName' },
      mimeType: { type: DataTypes.STRING(100), allowNull: true, field: 'mimeType' },
      fileSize: { type: DataTypes.INTEGER, allowNull: true, field: 'fileSize' },
      expiryDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'expiryDate' },
      isVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isVerified' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. employee_lifecycle_logs ──────────────────────────────────────────────
  await queryInterface.createTable(
    'employee_lifecycle_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'employeeId',
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      eventType: { type: DataTypes.STRING(100), allowNull: false, field: 'eventType' },
      fromStatus: { type: DataTypes.STRING(100), allowNull: true, field: 'fromStatus' },
      toStatus: { type: DataTypes.STRING(100), allowNull: true, field: 'toStatus' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      changedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'changedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      effectiveDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'effectiveDate' },
      metadata: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 7. company_hr_policies (unified with all break & attendance policy columns) ─────
  await queryInterface.createTable(
    'company_hr_policies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      policyName: { type: DataTypes.STRING(255), allowNull: false, field: 'policyName' },
      policyType: { type: DataTypes.STRING(100), allowNull: true, field: 'policyType' },
      content: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      effectiveDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'effectiveDate' },
      defaultBreakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30, field: 'defaultBreakMinutes' },
      defaultBreakStartTime: { type: DataTypes.TIME, allowNull: true, field: 'defaultBreakStartTime' },
      defaultBreakEndTime: { type: DataTypes.TIME, allowNull: true, field: 'defaultBreakEndTime' },
      weeklyOffDays: { type: DataTypes.JSONB, allowNull: false, defaultValue: ['SUNDAY'], field: 'weeklyOffDays' },
      gracePeriodMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15, field: 'gracePeriodMinutes' },
      halfDayThresholdHours: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 4.0, field: 'halfDayThresholdHours' },
      fullDayThresholdHours: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 8.0, field: 'fullDayThresholdHours' },
      overtimeThresholdHours: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 8.0, field: 'overtimeThresholdHours' },
      penaltyMode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'NONE', field: 'penaltyMode' },
      lateArrivalPenaltyPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0.0, field: 'lateArrivalPenaltyPercentage' },
      earlyDeparturePenaltyPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0.0, field: 'earlyDeparturePenaltyPercentage' },
      maxLateArrivalsAllowed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, field: 'maxLateArrivalsAllowed' },
      checkInReminderTime: { type: DataTypes.STRING(5), allowNull: true, defaultValue: '08:45', field: 'checkInReminderTime' },
      checkOutReminderTime: { type: DataTypes.STRING(5), allowNull: true, defaultValue: '17:15', field: 'checkOutReminderTime' },
      sendReminderEmails: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'sendReminderEmails' },
      mandatoryBreakDeduction: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'mandatoryBreakDeduction' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 02 - HRMS & HR Policies tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('company_hr_policies').catch(() => { });
  await queryInterface.dropTable('employee_lifecycle_logs').catch(() => { });
  await queryInterface.dropTable('employee_documents').catch(() => { });
  await queryInterface.dropTable('employees').catch(() => { });
  await queryInterface.dropTable('shifts').catch(() => { });
  await queryInterface.dropTable('designations').catch(() => { });
  await queryInterface.dropTable('branches').catch(() => { });
  console.log('✅ Phase 02 - HRMS & HR Policies tables dropped');
}
