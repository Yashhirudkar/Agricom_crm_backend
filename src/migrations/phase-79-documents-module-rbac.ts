import { QueryInterface } from 'sequelize';

export const phase = '79';
export const name = 'create documents module and shipment stuffing execution rbac and sidebar';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;

    // 1. Ensure AppModule "Documents"
    await seq.query(
      `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
       VALUES ('Documents', 85, NOW(), NOW())
       ON CONFLICT (name) DO NOTHING;`,
      { transaction },
    );

    const [docModule]: any[] = await seq.query(
      `SELECT id FROM app_modules WHERE name = 'Documents' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );
    const docModuleId = docModule?.id;

    if (docModuleId) {
      // 2. Ensure ModuleResource "shipment_stuffing_execution"
      await seq.query(
        `INSERT INTO module_resources (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
         VALUES ('shipment_stuffing_execution', 'Shipment Stuffing Execution', :docModuleId, 10, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET module_id = :docModuleId, display_name = 'Shipment Stuffing Execution';`,
        { replacements: { docModuleId }, transaction },
      );

      const [stuffingResource]: any[] = await seq.query(
        `SELECT id FROM module_resources WHERE name = 'shipment_stuffing_execution' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      const stuffingResourceId = stuffingResource?.id;

      if (stuffingResourceId) {
        // 3. Ensure ResourceActions VIEW and UPDATE
        await seq.query(
          `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
           VALUES ('VIEW', 'VIEW', :stuffingResourceId, 0, NOW(), NOW())
           ON CONFLICT DO NOTHING;`,
          { replacements: { stuffingResourceId }, transaction },
        );

        await seq.query(
          `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
           VALUES ('UPDATE', 'UPDATE', :stuffingResourceId, 10, NOW(), NOW())
           ON CONFLICT DO NOTHING;`,
          { replacements: { stuffingResourceId }, transaction },
        );

        const actions: any[] = await seq.query(
          `SELECT id FROM resource_actions WHERE resource_id = :stuffingResourceId;`,
          { replacements: { stuffingResourceId }, type: 'SELECT', transaction },
        );

        // 4. Grant to Admin & Client Admin roles
        const roles: any[] = await seq.query(
          `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
          { type: 'SELECT', transaction },
        );

        for (const role of roles) {
          for (const action of actions) {
            await seq.query(
              `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
               VALUES (:roleId, :actionId, NOW(), NOW())
               ON CONFLICT (role_id, resource_action_id) DO NOTHING;`,
              { replacements: { roleId: role.id, actionId: action.id }, transaction },
            );
          }
        }

        // 5. Grant client access for existing clients
        const clients: any[] = await seq.query(
          `SELECT id FROM clients;`,
          { type: 'SELECT', transaction },
        );

        for (const client of clients) {
          await seq.query(
            `INSERT INTO client_module_access (client_id, module_id, "createdAt", "updatedAt")
             VALUES (:clientId, :docModuleId, NOW(), NOW())
             ON CONFLICT (client_id, module_id) DO NOTHING;`,
            { replacements: { clientId: client.id, docModuleId }, transaction },
          );

          for (const action of actions) {
            await seq.query(
              `INSERT INTO client_action_access (client_id, resource_action_id, "createdAt", "updatedAt")
               VALUES (:clientId, :actionId, NOW(), NOW())
               ON CONFLICT (client_id, resource_action_id) DO NOTHING;`,
              { replacements: { clientId: client.id, actionId: action.id }, transaction },
            );
          }
        }
      }
    }

    // 6. Ensure SidebarFolder "Documents"
    const [existingFolder]: any[] = await seq.query(
      `SELECT id FROM sidebar_folders WHERE name = 'Documents' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );

    let folderId = existingFolder?.id;
    if (!folderId) {
      await seq.query(
        `INSERT INTO sidebar_folders (name, icon_name, sort_order, is_active, is_collapsible, "createdAt", "updatedAt")
         VALUES ('Documents', 'Folder', 85, true, true, NOW(), NOW());`,
        { transaction },
      );
      const [newFolder]: any[] = await seq.query(
        `SELECT id FROM sidebar_folders WHERE name = 'Documents' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      folderId = newFolder?.id;
    } else {
      await seq.query(
        `UPDATE sidebar_folders SET is_active = true, is_collapsible = true, sort_order = 85 WHERE id = :folderId;`,
        { replacements: { folderId }, transaction },
      );
    }

    if (folderId) {
      // 7. Ensure SidebarItem "Shipment Stuffing Execution"
      const [existingItem]: any[] = await seq.query(
        `SELECT id FROM sidebar_items WHERE route = '/documents/shipment-stuffing-execution' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );

      let itemId = existingItem?.id;
      if (!itemId) {
        await seq.query(
          `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
           VALUES ('Shipment Stuffing Execution', '/documents/shipment-stuffing-execution', 'FileText', :folderId, 10, true, 'shipment_stuffing_execution:view', NOW(), NOW());`,
          { replacements: { folderId }, transaction },
        );
        const [newItem]: any[] = await seq.query(
          `SELECT id FROM sidebar_items WHERE route = '/documents/shipment-stuffing-execution' LIMIT 1;`,
          { type: 'SELECT', transaction },
        );
        itemId = newItem?.id;
      } else {
        await seq.query(
          `UPDATE sidebar_items SET name = 'Shipment Stuffing Execution', folder_id = :folderId, icon_name = 'FileText', permission_link = 'shipment_stuffing_execution:view', is_active = true WHERE id = :itemId;`,
          { replacements: { folderId, itemId }, transaction },
        );
      }

      // 8. Grant client access to sidebar folder & item
      const clients: any[] = await seq.query(
        `SELECT id FROM clients;`,
        { type: 'SELECT', transaction },
      );

      for (const client of clients) {
        await seq.query(
          `INSERT INTO client_folder_access (client_id, folder_id, "createdAt", "updatedAt")
           VALUES (:clientId, :folderId, NOW(), NOW())
           ON CONFLICT (client_id, folder_id) DO NOTHING;`,
          { replacements: { clientId: client.id, folderId }, transaction },
        );

        if (itemId) {
          await seq.query(
            `INSERT INTO client_item_access (client_id, item_id, "createdAt", "updatedAt")
             VALUES (:clientId, :itemId, NOW(), NOW())
             ON CONFLICT (client_id, item_id) DO NOTHING;`,
            { replacements: { clientId: client.id, itemId }, transaction },
          );
        }
      }
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
    const seq = queryInterface.sequelize;
    await seq.query(
      `DELETE FROM sidebar_items WHERE route = '/documents/shipment-stuffing-execution';`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM sidebar_folders WHERE name = 'Documents';`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

