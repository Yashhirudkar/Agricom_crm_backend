import { QueryInterface } from 'sequelize';

export const phase = '102';
export const name = 'restore shipment cargo allocation permissions';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(
      `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
       SELECT 'Cargo Allocation', 86, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM app_modules WHERE name = 'Cargo Allocation'
       );`,
      { transaction },
    );

    const [module]: any[] = await sequelize.query(
      `SELECT id FROM app_modules WHERE name = 'Cargo Allocation' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );

    await sequelize.query(
      `INSERT INTO module_resources
         (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
       SELECT 'cargo_allocation', 'Cargo Allocation', :moduleId, 10, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM module_resources WHERE name = 'cargo_allocation'
       );`,
      { replacements: { moduleId: module.id }, transaction },
    );

    const [resource]: any[] = await sequelize.query(
      `SELECT id FROM module_resources WHERE name = 'cargo_allocation' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );
    const actions = [
      { name: 'VIEW', displayName: 'VIEW', sortOrder: 0 },
      { name: 'CREATE', displayName: 'CREATE', sortOrder: 10 },
      { name: 'UPDATE', displayName: 'UPDATE', sortOrder: 20 },
      {
        name: 'EDIT_COMPLETED',
        displayName: 'EDIT COMPLETED',
        sortOrder: 30,
      },
    ];

    for (const action of actions) {
      await sequelize.query(
        `INSERT INTO resource_actions
           (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
         SELECT :name, :displayName, :resourceId, :sortOrder, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM resource_actions
           WHERE name = :name AND resource_id = :resourceId
         );`,
        {
          replacements: {
            ...action,
            resourceId: resource.id,
          },
          transaction,
        },
      );
    }

    const resourceActions: any[] = await sequelize.query(
      `SELECT id
       FROM resource_actions
       WHERE resource_id = :resourceId
         AND name IN ('VIEW', 'CREATE', 'UPDATE', 'EDIT_COMPLETED');`,
      {
        replacements: { resourceId: resource.id },
        type: 'SELECT',
        transaction,
      },
    );
    const clients: any[] = await sequelize.query(`SELECT id FROM clients;`, {
      type: 'SELECT',
      transaction,
    });

    for (const client of clients) {
      await sequelize.query(
        `INSERT INTO client_module_access (client_id, module_id, created_at)
         SELECT :clientId, :moduleId, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM client_module_access
           WHERE client_id = :clientId AND module_id = :moduleId
         );`,
        {
          replacements: { clientId: client.id, moduleId: module.id },
          transaction,
        },
      );

      for (const action of resourceActions) {
        await sequelize.query(
          `INSERT INTO client_action_access
             (client_id, resource_action_id, created_at)
           SELECT :clientId, :actionId, NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM client_action_access
             WHERE client_id = :clientId AND resource_action_id = :actionId
           );`,
          {
            replacements: { clientId: client.id, actionId: action.id },
            transaction,
          },
        );
      }
    }

    const adminRoles: any[] = await sequelize.query(
      `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
      { type: 'SELECT', transaction },
    );

    for (const role of adminRoles) {
      for (const action of resourceActions) {
        await sequelize.query(
          `INSERT INTO role_action_permissions
             (role_id, resource_action_id, "createdAt", "updatedAt")
           SELECT :roleId, :actionId, NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM role_action_permissions
             WHERE role_id = :roleId AND resource_action_id = :actionId
           );`,
          {
            replacements: { roleId: role.id, actionId: action.id },
            transaction,
          },
        );
      }
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(
      `DELETE FROM client_action_access
       WHERE resource_action_id IN (
         SELECT id FROM resource_actions
         WHERE resource_id IN (
           SELECT id FROM module_resources WHERE name = 'cargo_allocation'
         )
       );`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM role_action_permissions
       WHERE resource_action_id IN (
         SELECT id FROM resource_actions
         WHERE resource_id IN (
           SELECT id FROM module_resources WHERE name = 'cargo_allocation'
         )
       );`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM resource_actions
       WHERE resource_id IN (
         SELECT id FROM module_resources WHERE name = 'cargo_allocation'
       );`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM module_resources WHERE name = 'cargo_allocation';`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM client_module_access
       WHERE module_id IN (
         SELECT id FROM app_modules WHERE name = 'Cargo Allocation'
       );`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM permission_group_modules
       WHERE module_id IN (
         SELECT id FROM app_modules WHERE name = 'Cargo Allocation'
       );`,
      { transaction },
    );
    await sequelize.query(
      `DELETE FROM app_modules WHERE name = 'Cargo Allocation';`,
      { transaction },
    );
  });
}
