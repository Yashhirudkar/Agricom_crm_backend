import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '02';
export const name = 'System Tables (app_modules, module_resources, resource_actions, sidebar_folders, sidebar_items)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. app_modules ──────────────────────────────────────────────────────────
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

  // ─── 2. module_resources ─────────────────────────────────────────────────────
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

  // ─── 3. resource_actions ─────────────────────────────────────────────────────
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

  // ─── 4. sidebar_folders ──────────────────────────────────────────────────────
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

  // ─── 5. sidebar_items ────────────────────────────────────────────────────────
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

  // ─── 6. system_audit_logs ────────────────────────────────────────────────────
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

  // Ensure created_at column exists in case table was created earlier without it
  const auditLogTableInfo: any = await queryInterface.describeTable('system_audit_logs').catch(() => null);
  if (auditLogTableInfo && !auditLogTableInfo.created_at) {
    await queryInterface.addColumn('system_audit_logs', 'created_at', {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    });
  }

  console.log('✅ Phase 02 - System tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('system_audit_logs').catch(() => {});
  await queryInterface.dropTable('sidebar_items').catch(() => {});
  await queryInterface.dropTable('sidebar_folders').catch(() => {});
  await queryInterface.dropTable('resource_actions').catch(() => {});
  await queryInterface.dropTable('module_resources').catch(() => {});
  await queryInterface.dropTable('app_modules').catch(() => {});
  console.log('✅ Phase 02 - System tables dropped');
}

