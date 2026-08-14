import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '09';
export const name = 'Enquiries, Follow-ups, Notifications & System Activity Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. holidays ─────────────────────────────────────────────────────────────
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

  // ─── 2. holiday_companies ───────────────────────────────────────────────────
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

  // ─── 3. enquiries (with logistics fields built in) ──────────────────────────
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
      shipment_mode: { type: DataTypes.STRING(50), allowNull: true },
      origin_port: { type: DataTypes.STRING(100), allowNull: true },
      destination_port: { type: DataTypes.STRING(100), allowNull: true },
      origin_state: { type: DataTypes.STRING(100), allowNull: true },
      origin_city: { type: DataTypes.STRING(100), allowNull: true },
      destination_country: { type: DataTypes.STRING(100), allowNull: true },
      destination_state: { type: DataTypes.STRING(100), allowNull: true },
      destination_city: { type: DataTypes.STRING(100), allowNull: true },
      bid_currency: { type: DataTypes.STRING(10), allowNull: true },
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

  // ─── 4. attachments ──────────────────────────────────────────────────────────
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

  // ─── 5. audit_logs ───────────────────────────────────────────────────────────
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

  // ─── 6. profile_activity_logs ────────────────────────────────────────────────
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

  // ─── 7. notifications ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'notifications',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: DataTypes.STRING(50), allowNull: false },
      referenceType: { type: DataTypes.STRING(100), allowNull: false, field: 'referenceType' },
      referenceId: { type: DataTypes.INTEGER, allowNull: false, field: 'referenceId' },
      title: { type: DataTypes.STRING(255), allowNull: false },
      payload: { type: DataTypes.JSONB, allowNull: false },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isRead' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('notifications', ['userId'], { name: 'notifications_user_id' }).catch(() => { });
  await queryInterface.addIndex('notifications', ['createdAt'], { name: 'notifications_created_at' }).catch(() => { });

  console.log('✅ Phase 09 - Enquiries, Follow-ups, Notifications & Logs created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('notifications').catch(() => { });
  await queryInterface.dropTable('profile_activity_logs').catch(() => { });
  await queryInterface.dropTable('audit_logs').catch(() => { });
  await queryInterface.dropTable('attachments').catch(() => { });
  await queryInterface.dropTable('enquiries').catch(() => { });
  await queryInterface.dropTable('holiday_companies').catch(() => { });
  await queryInterface.dropTable('holidays').catch(() => { });
  console.log('✅ Phase 09 - Enquiries, Follow-ups, Notifications & Logs dropped');
}
