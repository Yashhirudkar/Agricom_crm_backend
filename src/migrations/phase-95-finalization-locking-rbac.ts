import { QueryInterface } from 'sequelize';

export const phase = '95';
export const name = 'finalization locking and granular rbac for cargo, freight, and stuffing';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;

    // Helper to ensure an AppModule exists
    const ensureModule = async (moduleName: string, sortOrder: number) => {
      await seq.query(
        `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
         SELECT :moduleName, :sortOrder, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE name = :moduleName);`,
        { replacements: { moduleName, sortOrder }, transaction },
      );
      const [row]: any[] = await seq.query(
        `SELECT id FROM app_modules WHERE name = :moduleName LIMIT 1;`,
        { replacements: { moduleName }, type: 'SELECT', transaction },
      );
      return row?.id;
    };

    // Helper to ensure a ModuleResource exists
    const ensureResource = async (
      resName: string,
      displayName: string,
      moduleId: number,
      sortOrder: number,
    ) => {
      await seq.query(
        `INSERT INTO module_resources (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
         SELECT :resName, :displayName, :moduleId, :sortOrder, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM module_resources WHERE name = :resName);`,
        { replacements: { resName, displayName, moduleId, sortOrder }, transaction },
      );
      await seq.query(
        `UPDATE module_resources
         SET module_id = :moduleId, display_name = :displayName
         WHERE name = :resName;`,
        { replacements: { resName, displayName, moduleId }, transaction },
      );
      const [row]: any[] = await seq.query(
        `SELECT id FROM module_resources WHERE name = :resName LIMIT 1;`,
        { replacements: { resName }, type: 'SELECT', transaction },
      );
      return row?.id;
    };

    // Helper to ensure ResourceActions exist
    const ensureActions = async (
      resourceId: number,
      actionList: Array<{ name: string; sortOrder: number }>,
    ) => {
      for (const act of actionList) {
        const displayName = act.name.replace(/_/g, ' ');
        await seq.query(
          `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
           SELECT :name, :displayName, :resourceId, :sortOrder, NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM resource_actions
             WHERE name = :name AND resource_id = :resourceId
           );`,
          {
            replacements: {
              name: act.name,
              displayName,
              resourceId,
              sortOrder: act.sortOrder,
            },
            transaction,
          },
        );
      }
      const rows: any[] = await seq.query(
        `SELECT id FROM resource_actions WHERE resource_id = :resourceId;`,
        { replacements: { resourceId }, type: 'SELECT', transaction },
      );
      return rows.map((r) => r.id);
    };

    // 1. Cargo Allocation Module & Resource
    const cargoModuleId = await ensureModule('Cargo Allocation', 86);
    const cargoResourceId = await ensureResource(
      'cargo_allocation',
      'Cargo Allocation',
      cargoModuleId,
      10,
    );
    const cargoActionIds = await ensureActions(cargoResourceId, [
      { name: 'VIEW', sortOrder: 0 },
      { name: 'CREATE', sortOrder: 10 },
      { name: 'UPDATE', sortOrder: 20 },
      { name: 'DELETE', sortOrder: 30 },
      { name: 'EDIT_COMPLETED', sortOrder: 40 },
    ]);

    // 2. Freight Allocation Module & Resource
    const freightModuleId = await ensureModule('Freight Allocation', 87);
    const freightResourceId = await ensureResource(
      'freight_allocation',
      'Freight Allocation',
      freightModuleId,
      10,
    );
    const freightActionIds = await ensureActions(freightResourceId, [
      { name: 'VIEW', sortOrder: 0 },
      { name: 'CREATE', sortOrder: 10 },
      { name: 'UPDATE', sortOrder: 20 },
      { name: 'DELETE', sortOrder: 30 },
      { name: 'EDIT_COMPLETED', sortOrder: 40 },
    ]);

    // 3. Documents Module & Shipment Stuffing Execution Resource
    const docModuleId = await ensureModule('Documents', 85);
    const stuffingResourceId = await ensureResource(
      'shipment_stuffing_execution',
      'Shipment Stuffing Execution',
      docModuleId,
      10,
    );
    const stuffingActionIds = await ensureActions(stuffingResourceId, [
      { name: 'VIEW', sortOrder: 0 },
      { name: 'UPDATE', sortOrder: 10 },
      { name: 'EDIT_COMPLETED', sortOrder: 20 },
    ]);

    const allActionIds = [
      ...new Set([...cargoActionIds, ...freightActionIds, ...stuffingActionIds]),
    ];

    // 4. Grant access to all existing clients
    const clients: any[] = await seq.query(`SELECT id FROM clients;`, {
      type: 'SELECT',
      transaction,
    });
    for (const client of clients) {
      for (const actionId of allActionIds) {
        await seq.query(
          `INSERT INTO client_action_access (client_id, resource_action_id, created_at)
           SELECT :clientId, :actionId, NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM client_action_access
             WHERE client_id = :clientId AND resource_action_id = :actionId
           );`,
          { replacements: { clientId: client.id, actionId }, transaction },
        );
      }
    }

    // 5. Grant all actions to Admin & Client Admin roles by default
    const adminRoles: any[] = await seq.query(
      `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
      { type: 'SELECT', transaction },
    );
    for (const role of adminRoles) {
      for (const actionId of allActionIds) {
        await seq.query(
          `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
           SELECT :roleId, :actionId, NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM role_action_permissions
             WHERE role_id = :roleId AND resource_action_id = :actionId
           );`,
          { replacements: { roleId: role.id, actionId }, transaction },
        );
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(): Promise<void> {
  // Irreversible granular permission migration
}
