import { QueryInterface } from 'sequelize';

export const phase = '78';
export const name = 'add indexes for permission bootstrap lookups';

const INDEXES = [
  ['app_modules', 'idx_app_modules_name', 'name'],
  ['module_resources', 'idx_module_resources_name', 'name'],
  ['module_resources', 'idx_module_resources_module_id', 'module_id'],
  [
    'resource_actions',
    'idx_resource_actions_resource_id_name',
    'resource_id, name',
  ],
  [
    'client_module_access',
    'idx_client_module_access_module_client',
    'module_id, client_id',
  ],
  [
    'client_action_access',
    'idx_client_action_access_action_client',
    'resource_action_id, client_id',
  ],
  [
    'role_action_permissions',
    'idx_role_action_permissions_role_action',
    'role_id, resource_action_id',
  ],
] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    for (const [table, index, fields] of INDEXES) {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table} (${fields})`,
        { transaction },
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    for (const [table, index] of INDEXES) {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS ${index}`,
        { transaction },
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
