import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '03';
export const name = 'RBAC Tables (roles, user_roles, role_action_permissions)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. roles ────────────────────────────────────────────────────────────────
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

  await queryInterface
    .addIndex('roles', ['clientId'], { name: 'roles_client_id' })
    .catch(() => {});
  await queryInterface
    .addIndex('roles', ['companyId'], { name: 'roles_company_id' })
    .catch(() => {});
  // Unique: name + clientId
  await queryInterface
    .addIndex('roles', ['name', 'clientId'], { name: 'roles_name_client_unique', unique: true })
    .catch(() => {});

  // ─── 2. user_roles ───────────────────────────────────────────────────────────
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

  // ─── 3. role_action_permissions ──────────────────────────────────────────────
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

  console.log('✅ Phase 03 - RBAC tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('role_action_permissions').catch(() => {});
  await queryInterface.dropTable('user_roles').catch(() => {});
  await queryInterface.dropTable('roles').catch(() => {});
  console.log('✅ Phase 03 - RBAC tables dropped');
}

