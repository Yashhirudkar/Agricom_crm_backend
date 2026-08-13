import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '01';
export const name = 'Core System, User Management & RBAC Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. clients ──────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'clients',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      allowedCompanies: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, field: 'allowedCompanies' },
      allowedUsers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15, field: 'allowedUsers' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 2. users ────────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'users',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      avatarUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'avatarUrl' },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      lastLogin: { type: DataTypes.DATE, allowNull: true, field: 'lastLogin' },
      lastCompanyId: { type: DataTypes.INTEGER, allowNull: true, field: 'lastCompanyId' },
      companyId: { type: DataTypes.INTEGER, allowNull: true, field: 'companyId' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('users', ['clientId'], { name: 'users_client_id' }).catch(() => { });
  await queryInterface.addIndex('users', ['companyId'], { name: 'users_company_id' }).catch(() => { });

  // ─── 3. companies ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'companies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      legalName: { type: DataTypes.STRING(255), allowNull: true, field: 'legalName' },
      companyCode: { type: DataTypes.STRING(50), allowNull: true, unique: true, field: 'companyCode' },
      companyType: { type: DataTypes.STRING(100), allowNull: true, field: 'companyType' },
      industryType: { type: DataTypes.STRING(100), allowNull: true, field: 'industryType' },
      description: { type: DataTypes.TEXT, allowNull: true },
      registrationNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'registration_number' },
      taxNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'tax_number' },
      employeeCount: { type: DataTypes.INTEGER, allowNull: true, field: 'employee_count' },
      companySize: { type: DataTypes.STRING(50), allowNull: true, field: 'company_size' },
      logoUrl: { type: DataTypes.TEXT, allowNull: true, field: 'logoUrl' },
      faviconUrl: { type: DataTypes.TEXT, allowNull: true, field: 'faviconUrl' },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      website: { type: DataTypes.STRING(255), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },
      establishedYear: { type: DataTypes.INTEGER, allowNull: true, field: 'established_year' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface
    .addConstraint('users', {
      fields: ['lastCompanyId'],
      type: 'foreign key',
      name: 'users_last_company_id_fk',
      references: { table: 'companies', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    } as any)
    .catch(() => { });

  // ─── 4. departments ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'departments',
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

  // ─── 5. app_modules ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'app_modules',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      icon_name: { type: DataTypes.STRING(50), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. module_resources ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'module_resources',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      display_name: { type: DataTypes.STRING(100), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      module_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'app_modules', key: 'id' },
        onDelete: 'SET NULL',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 7. resource_actions ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'resource_actions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(50), allowNull: false },
      display_name: { type: DataTypes.STRING(100), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      resource_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'module_resources', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 8. sidebar_folders ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'sidebar_folders',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      icon_name: { type: DataTypes.STRING(50), allowNull: true },
      icon_color: { type: DataTypes.STRING(50), allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_collapsible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 9. sidebar_items ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'sidebar_items',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      route: { type: DataTypes.STRING(255), allowNull: true },
      icon_name: { type: DataTypes.STRING(50), allowNull: true },
      icon_color: { type: DataTypes.STRING(50), allowNull: true },
      use_folder_color: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      permission_link: { type: DataTypes.STRING(100), allowNull: true },
      folder_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'sidebar_folders', key: 'id' },
        onDelete: 'SET NULL',
      },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 10. roles ───────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'roles',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      isSystemRole: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isSystemRole' },
      companyId: { type: DataTypes.INTEGER, allowNull: true, field: 'companyId' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('roles', ['clientId'], { name: 'roles_client_id' }).catch(() => { });
  await queryInterface.addIndex('roles', ['companyId'], { name: 'roles_company_id' }).catch(() => { });
  await queryInterface.addIndex('roles', ['name', 'clientId'], { name: 'roles_name_client_unique', unique: true }).catch(() => { });

  // ─── 11. user_roles ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'user_roles',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'roleId',
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      companyId: { type: DataTypes.INTEGER, allowNull: true, field: 'companyId' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 12. role_action_permissions ─────────────────────────────────────────────
  await queryInterface.createTable(
    'role_action_permissions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'role_id',
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      resource_action_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'resource_action_id',
        references: { model: 'resource_actions', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 13. client_module_access ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'client_module_access',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      module_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'app_modules', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 14. client_folder_access ────────────────────────────────────────────────
  await queryInterface.createTable(
    'client_folder_access',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      folder_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sidebar_folders', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 15. client_item_access ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'client_item_access',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      item_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sidebar_items', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 16. client_action_access ────────────────────────────────────────────────
  await queryInterface.createTable(
    'client_action_access',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      resource_action_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'resource_actions', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 17. user_preferences (including birthday metadata) ──────────────────────
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
      attendanceReminderTime: { type: DataTypes.STRING(5), allowNull: true, defaultValue: '09:00', field: 'attendanceReminderTime' },
      birthday_wishes_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      show_age_in_wishes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 18. user_sessions ────────────────────────────────────────────────────────
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

  // ─── 19. user_companies ───────────────────────────────────────────────────────
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

  await queryInterface.addIndex('user_companies', ['userId', 'companyId'], { name: 'user_companies_user_company_unique', unique: true }).catch(() => { });
  await queryInterface.addIndex('user_companies', ['roleId'], { name: 'user_companies_role_id' }).catch(() => { });

  // ─── 20. user_invitations ─────────────────────────────────────────────────────
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

  // ─── 21. user_password_histories ─────────────────────────────────────────────
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

  // ─── 22. system_audit_logs ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'system_audit_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: DataTypes.STRING(100), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 01 - Core System & RBAC tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('system_audit_logs').catch(() => { });
  await queryInterface.dropTable('user_password_histories').catch(() => { });
  await queryInterface.dropTable('user_invitations').catch(() => { });
  await queryInterface.dropTable('user_companies').catch(() => { });
  await queryInterface.dropTable('user_sessions').catch(() => { });
  await queryInterface.dropTable('user_preferences').catch(() => { });
  await queryInterface.dropTable('client_action_access').catch(() => { });
  await queryInterface.dropTable('client_item_access').catch(() => { });
  await queryInterface.dropTable('client_folder_access').catch(() => { });
  await queryInterface.dropTable('client_module_access').catch(() => { });
  await queryInterface.dropTable('role_action_permissions').catch(() => { });
  await queryInterface.dropTable('user_roles').catch(() => { });
  await queryInterface.dropTable('roles').catch(() => { });
  await queryInterface.dropTable('sidebar_items').catch(() => { });
  await queryInterface.dropTable('sidebar_folders').catch(() => { });
  await queryInterface.dropTable('resource_actions').catch(() => { });
  await queryInterface.dropTable('module_resources').catch(() => { });
  await queryInterface.dropTable('app_modules').catch(() => { });
  await queryInterface.dropTable('departments').catch(() => { });
  await queryInterface.dropTable('companies').catch(() => { });
  await queryInterface.dropTable('users').catch(() => { });
  await queryInterface.dropTable('clients').catch(() => { });
  console.log('✅ Phase 01 - Core System & RBAC tables dropped');
}
