import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '12';
export const name = 'Remaining Tables (holidays, holiday_companies, enquiries, attachments, audit_logs, system_audit_logs, profile_activity_logs, user_invitations, user_password_history, user_preferences, user_sessions, user_companies)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─═o═────═o═────═o═──────── 1. holidays ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'holidays',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      holidayDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'holidayDate' },
      holidayType: { type: DataTypes.STRING(50), allowNull: false, field: 'holidayType' },
      description: { type: DataTypes.TEXT, allowNull: true },
      isOptional: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isOptional' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      isWeeklyOff: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isWeeklyOff' },
      isHalfDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isHalfDay' },
      halfDayStart: { type: DataTypes.TIME, allowNull: true, field: 'halfDayStart' },
      halfDayEnd: { type: DataTypes.TIME, allowNull: true, field: 'halfDayEnd' },
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
  await queryInterface.addIndex('holidays', ['clientId'], { name: 'holidays_client_id' }).catch(() => { });

  // ─═o═────═o═────═o═──────── 2. holiday_companies ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'holiday_companies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      holidayId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'holidayId',
        references: { model: 'holidays', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─═o═────═o═────═o═──────── 3. enquiries ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'enquiries',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4, allowNull: false },
      enquiry_no: { type: DataTypes.STRING(50), allowNull: false },
      enquiry_date: { type: DataTypes.DATEONLY, allowNull: false },
      partner_role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partner_roles', key: 'id' },
        onDelete: 'RESTRICT',
      },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'RESTRICT',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onDelete: 'RESTRICT',
      },
      origin_country_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'countries', key: 'id' },
        onDelete: 'SET NULL',
      },
      purity: { type: DataTypes.STRING, allowNull: true },
      packing_type_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'packing_types', key: 'id' },
        onDelete: 'SET NULL',
      },
      pod_port: { type: DataTypes.STRING, allowNull: true },
      shipment_type: { type: DataTypes.STRING(50), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(15, 4), allowNull: true },
      shipment_date: { type: DataTypes.DATEONLY, allowNull: true },
      buying_interest: { type: DataTypes.DECIMAL(15, 4), allowNull: true },
      potential_enquiry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'NEW' },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
      deleted_at: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('enquiries', ['enquiry_no'], { name: 'enquiries_enquiry_no' }).catch(() => { });
  await queryInterface.addIndex('enquiries', ['partner_role_id'], { name: 'enquiries_partner_role_id' }).catch(() => { });
  await queryInterface.addIndex('enquiries', ['partner_id'], { name: 'enquiries_partner_id' }).catch(() => { });
  await queryInterface.addIndex('enquiries', ['product_id'], { name: 'enquiries_product_id' }).catch(() => { });
  await queryInterface.addIndex('enquiries', ['status'], { name: 'enquiries_status' }).catch(() => { });

  // ─═o═────═o═────═o═──────── 4. attachments ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'attachments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      entityType: { type: DataTypes.STRING(100), allowNull: false, field: 'entityType' },
      entityId: { type: DataTypes.INTEGER, allowNull: false, field: 'entityId' },
      fileName: { type: DataTypes.STRING(255), allowNull: false, field: 'fileName' },
      filePath: { type: DataTypes.STRING(1000), allowNull: false, field: 'filePath' },
      mimeType: { type: DataTypes.STRING(100), allowNull: true, field: 'mimeType' },
      fileSize: { type: DataTypes.INTEGER, allowNull: true, field: 'fileSize' },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'uploadedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─═o═────═o═────═o═──────── 5. audit_logs ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'audit_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'SET NULL',
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'SET NULL',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      entityType: { type: DataTypes.STRING(100), allowNull: false, field: 'entityType' },
      entityId: { type: DataTypes.INTEGER, allowNull: true, field: 'entityId' },
      action: { type: DataTypes.STRING(100), allowNull: false },
      oldValue: { type: DataTypes.JSONB, allowNull: true, field: 'oldValue' },
      newValue: { type: DataTypes.JSONB, allowNull: true, field: 'newValue' },
      ipAddress: { type: DataTypes.STRING(50), allowNull: true, field: 'ipAddress' },
      userAgent: { type: DataTypes.STRING(255), allowNull: true, field: 'userAgent' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('audit_logs', ['clientId'], { name: 'audit_logs_client_id' }).catch(() => { });
  await queryInterface.addIndex('audit_logs', ['companyId'], { name: 'audit_logs_company_id' }).catch(() => { });
  await queryInterface.addIndex('audit_logs', ['userId'], { name: 'audit_logs_user_id' }).catch(() => { });

  // ─═o═────═o═────═o═──────── 6. profile_activity_logs ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'profile_activity_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      fieldName: { type: DataTypes.STRING(100), allowNull: false, field: 'fieldName' },
      oldValue: { type: DataTypes.TEXT, allowNull: true, field: 'oldValue' },
      newValue: { type: DataTypes.TEXT, allowNull: true, field: 'newValue' },
      actorType: {
        type: DataTypes.ENUM('EMPLOYEE', 'ADMIN', 'SYSTEM'),
        allowNull: false,
        defaultValue: 'EMPLOYEE',
        field: 'actorType',
      },
      ipAddress: { type: DataTypes.STRING(45), allowNull: true, field: 'ipAddress' },
      userAgent: { type: DataTypes.TEXT, allowNull: true, field: 'userAgent' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('profile_activity_logs', ['userId'], { name: 'profile_activity_logs_user_id' }).catch(() => { });

  // ─═o═────═o═────═o═──────── 7. user_invitations ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'user_invitations',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      token: { type: DataTypes.STRING(500), allowNull: false, unique: true },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'roleId',
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyIds: { type: DataTypes.JSONB, allowNull: true, field: 'companyIds' },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'createdBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expiresAt' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Pending' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─═o═────═o═────═o═──────── 8. user_password_histories ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'user_password_histories',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      passwordHash: { type: DataTypes.STRING(500), allowNull: false, field: 'passwordHash' },
      changedAt: { type: DataTypes.DATE, allowNull: false, field: 'changedAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─═o═────═o═────═o═──────── 9. user_preferences ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'user_preferences',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      twoFactorEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'twoFactorEnabled' },
      emailNotifications: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'emailNotifications' },
      pushNotifications: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'pushNotifications' },
      theme: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'system', field: 'theme' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );


  // ─═o═────═o═────═o═──────── 10. user_sessions ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'user_sessions',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      sessionId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'sessionId' },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      refreshTokenHash: { type: DataTypes.STRING, allowNull: false, unique: true, field: 'refreshTokenHash' },
      ipAddress: { type: DataTypes.STRING, allowNull: true, field: 'ipAddress' },
      userAgent: { type: DataTypes.STRING, allowNull: true, field: 'userAgent' },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expiresAt' },
      lastUsedAt: { type: DataTypes.DATE, allowNull: false, field: 'lastUsedAt' },
      isRevoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isRevoked' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─═o═────═o═────═o═──────── 11. user_companies ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
  await queryInterface.createTable(
    'user_companies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'companyId',
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'roleId',
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active', field: 'status' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addIndex('user_companies', ['userId', 'companyId'], { name: 'user_companies_user_company_unique', unique: true })
    .catch(() => { });
  await queryInterface
    .addIndex('user_companies', ['roleId'], { name: 'user_companies_role_id' })
    .catch(() => { });

  // ─═o═────═o═────═o═──────── 12. company_hr_policies ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────
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
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 12 - Remaining tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('company_hr_policies').catch(() => { });
  await queryInterface.dropTable('user_companies').catch(() => { });
  await queryInterface.dropTable('user_sessions').catch(() => { });
  await queryInterface.dropTable('user_preferences').catch(() => { });
  await queryInterface.dropTable('user_password_histories').catch(() => { });
  await queryInterface.dropTable('user_invitations').catch(() => { });
  await queryInterface.dropTable('profile_activity_logs').catch(() => { });
  await queryInterface.dropTable('audit_logs').catch(() => { });
  await queryInterface.dropTable('attachments').catch(() => { });
  await queryInterface.dropTable('enquiries').catch(() => { });
  await queryInterface.dropTable('holiday_companies').catch(() => { });
  await queryInterface.dropTable('holidays').catch(() => { });
  console.log('✅ Phase 12 - Remaining tables dropped');
}

