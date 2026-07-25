import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '04';
export const name = 'Client Access Tables (client_module_access, client_folder_access, client_item_access, client_action_access)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. client_module_access ──────────────────────────────────────────────────
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

  // ─── 2. client_folder_access ─────────────────────────────────────────────────
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

  // ─── 3. client_item_access ───────────────────────────────────────────────────
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

  // ─── 4. client_action_access ─────────────────────────────────────────────────
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

  console.log('✅ Phase 04 - Client access tables created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('client_action_access').catch(() => {});
  await queryInterface.dropTable('client_item_access').catch(() => {});
  await queryInterface.dropTable('client_folder_access').catch(() => {});
  await queryInterface.dropTable('client_module_access').catch(() => {});
  console.log('✅ Phase 04 - Client access tables dropped');
}

