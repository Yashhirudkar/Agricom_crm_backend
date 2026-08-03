import { QueryInterface } from 'sequelize';

export const phase = '20';
export const name = 'Sync Follow Up and Sales Contract permissions and client sidebar access';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  console.log('Running Migration Phase 20 - Syncing Follow Up and Sales Contract permissions...');

  // 1. Ensure Follow Up module (ID 51) exists
  await sequelize.query(`
    INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
    VALUES (51, 'Follow Up', 1, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'Follow Up', sort_order = 1, "updatedAt" = NOW();
  `);

  // 2. Ensure Module Resource "follow_up" (ID 59) exists
  await sequelize.query(`
    INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
    VALUES (59, 'follow_up', 'Follow Up', 0, 51, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'follow_up', display_name = 'Follow Up', module_id = 51, "updatedAt" = NOW();
  `);

  // 3. Remove old READ and WRITE actions for follow_up
  await sequelize.query(`
    DELETE FROM role_action_permissions 
    WHERE resource_action_id IN (
      SELECT id FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE')
    );
  `);
  await sequelize.query(`
    DELETE FROM client_action_access 
    WHERE resource_action_id IN (
      SELECT id FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE')
    );
  `);
  await sequelize.query(`
    DELETE FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE');
  `);

  // 4. Create standard 5 actions for follow_up resource
  const standardActions = ['CREATE', 'VIEW', 'UPDATE', 'DELETE', 'FORCE_DELETE'];
  const followUpActionIds: number[] = [];

  for (let i = 0; i < standardActions.length; i++) {
    const actionName = standardActions[i];
    const sortOrder = (i + 1) * 10;
    
    const [checkRes]: any = await sequelize.query(`
      SELECT id FROM resource_actions WHERE resource_id = 59 AND name = :actionName;
    `, { replacements: { actionName } });

    let actionId: number;
    if (checkRes.length > 0) {
      actionId = checkRes[0].id;
      await sequelize.query(`
        UPDATE resource_actions SET sort_order = :sortOrder, "updatedAt" = NOW() WHERE id = :actionId;
      `, { replacements: { sortOrder, actionId } });
    } else {
      const [insertRes]: any = await sequelize.query(`
        INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
        VALUES (:actionName, :actionName, :sortOrder, 59, NOW(), NOW())
        RETURNING id;
      `, { replacements: { actionName, sortOrder } });
      actionId = insertRes[0].id;
    }
    followUpActionIds.push(actionId);
  }

  // 5. Cleanup duplicate Sales-contract module (ID 46) and resource sales-contract (ID 50)
  const [dupRes]: any = await sequelize.query("SELECT id FROM module_resources WHERE id = 50 AND name = 'sales-contract';");
  if (dupRes.length > 0) {
    await sequelize.query(`
      DELETE FROM role_action_permissions 
      WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 50);
    `);
    await sequelize.query(`
      DELETE FROM client_action_access 
      WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 50);
    `);
    await sequelize.query('DELETE FROM resource_actions WHERE resource_id = 50;');
    await sequelize.query('DELETE FROM module_resources WHERE id = 50;');
    await sequelize.query('DELETE FROM client_module_access WHERE module_id = 46;');
    await sequelize.query('DELETE FROM app_modules WHERE id = 46;');
  }

  // 6. Ensure standard Sales Contract module (ID 48) and sales_contract resource (ID 52) have all 5 actions
  await sequelize.query(`
    INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
    VALUES (48, 'Sales Contract', 29, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'Sales Contract', sort_order = 29, "updatedAt" = NOW();
  `);
  
  await sequelize.query(`
    INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
    VALUES (52, 'sales_contract', 'Sales Contract', 0, 48, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'sales_contract', display_name = 'Sales Contract', module_id = 48, "updatedAt" = NOW();
  `);

  const salesActions = ['CREATE', 'VIEW', 'UPDATE', 'DELETE', 'FORCE_DELETE'];
  const salesActionIds: number[] = [];
  for (let i = 0; i < salesActions.length; i++) {
    const actionName = salesActions[i];
    const sortOrder = (i + 1) * 10;
    
    const [checkRes]: any = await sequelize.query(`
      SELECT id FROM resource_actions WHERE resource_id = 52 AND name = :actionName;
    `, { replacements: { actionName } });

    let actionId: number;
    if (checkRes.length > 0) {
      actionId = checkRes[0].id;
      await sequelize.query(`
        UPDATE resource_actions SET sort_order = :sortOrder, "updatedAt" = NOW() WHERE id = :actionId;
      `, { replacements: { sortOrder, actionId } });
    } else {
      const [insertRes]: any = await sequelize.query(`
        INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
        VALUES (:actionName, :actionName, :sortOrder, 52, NOW(), NOW())
        RETURNING id;
      `, { replacements: { actionName, sortOrder } });
      actionId = insertRes[0].id;
    }
    salesActionIds.push(actionId);
  }

  // 7. Grant access to default roles: Admin (1) and Client Admin (2)
  const targetRoles = [1, 2];
  const allInsertedActionIds = [...followUpActionIds, ...salesActionIds];
  
  for (const roleId of targetRoles) {
    const [roleExists]: any = await sequelize.query('SELECT id FROM roles WHERE id = :roleId;', { replacements: { roleId } });
    if (roleExists.length === 0) continue;

    for (const actionId of allInsertedActionIds) {
      const [hasPerm]: any = await sequelize.query(
        'SELECT id FROM role_action_permissions WHERE role_id = :roleId AND resource_action_id = :actionId;',
        { replacements: { roleId, actionId } }
      );
      if (hasPerm.length === 0) {
        await sequelize.query(`
          INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
          VALUES (:roleId, :actionId, NOW(), NOW());
        `, { replacements: { roleId, actionId } });
      }
    }
  }

  // 8. Grant client access (actions, modules, folders, items)
  const [clientsRes]: any = await sequelize.query('SELECT id FROM clients;');
  const clientIds = clientsRes.map((r: any) => r.id);
  
  const [allActionsRes]: any = await sequelize.query('SELECT id FROM resource_actions;');
  const allActionIds = allActionsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
    // Actions
    for (const actionId of allActionIds) {
      const [hasAccess]: any = await sequelize.query(
        'SELECT id FROM client_action_access WHERE client_id = :clientId AND resource_action_id = :actionId;',
        { replacements: { clientId, actionId } }
      );
      if (hasAccess.length === 0) {
        await sequelize.query(`
          INSERT INTO client_action_access (client_id, resource_action_id, created_at)
          VALUES (:clientId, :actionId, NOW());
        `, { replacements: { clientId, actionId } });
      }
    }

    // Modules
    for (const moduleId of [51, 48]) {
      const [hasModuleAccess]: any = await sequelize.query(
        'SELECT id FROM client_module_access WHERE client_id = :clientId AND module_id = :moduleId;',
        { replacements: { clientId, moduleId } }
      );
      if (hasModuleAccess.length === 0) {
        await sequelize.query(`
          INSERT INTO client_module_access (client_id, module_id, created_at)
          VALUES (:clientId, :moduleId, NOW());
        `, { replacements: { clientId, moduleId } });
      }
    }

    // Sidebar Folders
    const [allFoldersRes]: any = await sequelize.query('SELECT id FROM sidebar_folders;');
    for (const folder of allFoldersRes) {
      const [hasFolderAccess]: any = await sequelize.query(
        'SELECT id FROM client_folder_access WHERE client_id = :clientId AND folder_id = :folderId;',
        { replacements: { clientId, folderId: folder.id } }
      );
      if (hasFolderAccess.length === 0) {
        await sequelize.query(`
          INSERT INTO client_folder_access (client_id, folder_id, created_at)
          VALUES (:clientId, :folderId, NOW());
        `, { replacements: { clientId, folderId: folder.id } });
      }
    }

    // Sidebar Items
    const [allItemsRes]: any = await sequelize.query('SELECT id FROM sidebar_items;');
    for (const item of allItemsRes) {
      const [hasItemAccess]: any = await sequelize.query(
        'SELECT id FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId;',
        { replacements: { clientId, itemId: item.id } }
      );
      if (hasItemAccess.length === 0) {
        await sequelize.query(`
          INSERT INTO client_item_access (client_id, item_id, created_at)
          VALUES (:clientId, :itemId, NOW());
        `, { replacements: { clientId, itemId: item.id } });
      }
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Safe down migration (optional, database sync usually isn't rolled back in dev/stage unless required)
}
