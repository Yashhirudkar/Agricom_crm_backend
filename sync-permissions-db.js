const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'Agricom_db',
});

async function run() {
  await client.connect();
  console.log('Connected to database. Starting synchronization transaction...');

  try {
    await client.query('BEGIN;');

    const targetRoles = [1, 2]; // Admin, Client Admin

    // 1. Ensure Follow Up module (ID 51) exists
    console.log('Ensuring App Module "Follow Up" (ID 51) exists...');
    await client.query(`
      INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
      VALUES (51, 'Follow Up', 1, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = 'Follow Up', sort_order = 1, "updatedAt" = NOW();
    `);

    // 2. Ensure Module Resource "follow_up" (ID 59) exists
    console.log('Ensuring Module Resource "follow_up" (ID 59) exists...');
    await client.query(`
      INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
      VALUES (59, 'follow_up', 'Follow Up', 0, 51, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = 'follow_up', display_name = 'Follow Up', module_id = 51, "updatedAt" = NOW();
    `);

    // 3. Remove old READ (231) and WRITE (232) actions for follow_up from mapping tables and action table
    console.log('Deleting legacy READ/WRITE permissions for follow_up...');
    await client.query(`
      DELETE FROM role_action_permissions 
      WHERE resource_action_id IN (
        SELECT id FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE')
      );
    `);
    await client.query(`
      DELETE FROM client_action_access 
      WHERE resource_action_id IN (
        SELECT id FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE')
      );
    `);
    await client.query(`
      DELETE FROM resource_actions WHERE resource_id = 59 AND name IN ('READ', 'WRITE');
    `);

    // 4. Create standard 5 actions for follow_up resource
    console.log('Creating standard 5 CRUD actions for follow_up resource...');
    const standardActions = ['CREATE', 'VIEW', 'UPDATE', 'DELETE', 'FORCE_DELETE'];
    const followUpActionIds = [];

    for (let i = 0; i < standardActions.length; i++) {
      const actionName = standardActions[i];
      const sortOrder = (i + 1) * 10;
      
      const checkRes = await client.query(`
        SELECT id FROM resource_actions WHERE resource_id = 59 AND name = $1;
      `, [actionName]);

      let actionId;
      if (checkRes.rows.length > 0) {
        actionId = checkRes.rows[0].id;
        await client.query(`
          UPDATE resource_actions SET sort_order = $1, "updatedAt" = NOW() WHERE id = $2;
        `, [sortOrder, actionId]);
      } else {
        const insertRes = await client.query(`
          INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
          VALUES ($1, $1, $2, 59, NOW(), NOW())
          RETURNING id;
        `, [actionName, sortOrder]);
        actionId = insertRes.rows[0].id;
      }
      followUpActionIds.push(actionId);
    }
    console.log(`Action IDs for follow_up CRUD:`, followUpActionIds);

    // 5. Cleanup duplicate Sales-contract module (ID 46) and resource sales-contract (ID 50)
    console.log('Checking for duplicate Sales-contract module/resource...');
    const dupRes = await client.query('SELECT id FROM module_resources WHERE id = 50 AND name = \'sales-contract\';');
    if (dupRes.rows.length > 0) {
      console.log('Migrating duplicate sales-contract permissions and deleting duplicate module...');
      await client.query(`
        DELETE FROM role_action_permissions 
        WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 50);
      `);
      await client.query(`
        DELETE FROM client_action_access 
        WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 50);
      `);
      await client.query('DELETE FROM resource_actions WHERE resource_id = 50;');
      await client.query('DELETE FROM module_resources WHERE id = 50;');
      await client.query('DELETE FROM client_module_access WHERE module_id = 46;');
      await client.query('DELETE FROM app_modules WHERE id = 46;');
      console.log('Duplicate Sales-contract module and resource deleted successfully.');
    }

    // 6. Ensure standard Sales Contract module (ID 48) and sales_contract resource (ID 52) have all 5 actions
    console.log('Ensuring Sales Contract (ID 48) & sales_contract (ID 52) are fully configured...');
    await client.query(`
      INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
      VALUES (48, 'Sales Contract', 29, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = 'Sales Contract', sort_order = 29, "updatedAt" = NOW();
    `);
    
    await client.query(`
      INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
      VALUES (52, 'sales_contract', 'Sales Contract', 0, 48, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = 'sales_contract', display_name = 'Sales Contract', module_id = 48, "updatedAt" = NOW();
    `);

    const salesActions = ['CREATE', 'VIEW', 'UPDATE', 'DELETE', 'FORCE_DELETE'];
    const salesActionIds = [];
    for (let i = 0; i < salesActions.length; i++) {
      const actionName = salesActions[i];
      const sortOrder = (i + 1) * 10;
      
      const checkRes = await client.query(`
        SELECT id FROM resource_actions WHERE resource_id = 52 AND name = $1;
      `, [actionName]);

      let actionId;
      if (checkRes.rows.length > 0) {
        actionId = checkRes.rows[0].id;
        await client.query(`
          UPDATE resource_actions SET sort_order = $1, "updatedAt" = NOW() WHERE id = $2;
        `, [sortOrder, actionId]);
      } else {
        const insertRes = await client.query(`
          INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
          VALUES ($1, $1, $2, 52, NOW(), NOW())
          RETURNING id;
        `, [actionName, sortOrder]);
        actionId = insertRes.rows[0].id;
      }
      salesActionIds.push(actionId);
    }
    console.log(`Action IDs for sales_contract CRUD:`, salesActionIds);

    // 7. Grant access to default roles: Admin (1) and Client Admin (2) for both follow_up and sales_contract
    console.log('Mapping permissions to Admin (ID 1) and Client Admin (ID 2) roles...');
    const allInsertedActionIds = [...followUpActionIds, ...salesActionIds];
    
    for (const roleId of targetRoles) {
      const roleExists = await client.query('SELECT id FROM roles WHERE id = $1;', [roleId]);
      if (roleExists.rows.length === 0) continue;

      for (const actionId of allInsertedActionIds) {
        const hasPerm = await client.query(
          'SELECT id FROM role_action_permissions WHERE role_id = $1 AND resource_action_id = $2;',
          [roleId, actionId]
        );
        if (hasPerm.rows.length === 0) {
          await client.query(`
            INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
            VALUES ($1, $2, NOW(), NOW());
          `, [roleId, actionId]);
        }
      }
    }

    // 8. Grant client action access for ALL actions in the DB to prevent 403 Forbidden errors
    console.log('Mapping permissions to client action access...');
    const clientsRes = await client.query('SELECT id FROM clients;');
    const clientIds = clientsRes.rows.map(r => r.id);
    
    const allActionsRes = await client.query('SELECT id FROM resource_actions;');
    const allActionIds = allActionsRes.rows.map(r => r.id);

    for (const clientId of clientIds) {
      for (const actionId of allActionIds) {
        const hasAccess = await client.query(
          'SELECT id FROM client_action_access WHERE client_id = $1 AND resource_action_id = $2;',
          [clientId, actionId]
        );
        if (hasAccess.rows.length === 0) {
          await client.query(`
            INSERT INTO client_action_access (client_id, resource_action_id, created_at)
            VALUES ($1, $2, NOW());
          `, [clientId, actionId]);
        }
      }

      // Ensure Client Module Access exists for Follow Up module (ID 51) and Sales Contract module (ID 48)
      for (const moduleId of [51, 48]) {
        const hasModuleAccess = await client.query(
          'SELECT id FROM client_module_access WHERE client_id = $1 AND module_id = $2;',
          [clientId, moduleId]
        );
        if (hasModuleAccess.rows.length === 0) {
          await client.query(`
            INSERT INTO client_module_access (client_id, module_id, created_at)
            VALUES ($1, $2, NOW());
          `, [clientId, moduleId]);
        }
      }

      // Ensure all sidebar folders are allowed for all clients
      const allFoldersRes = await client.query('SELECT id FROM sidebar_folders;');
      for (const folder of allFoldersRes.rows) {
        const hasFolderAccess = await client.query(
          'SELECT id FROM client_folder_access WHERE client_id = $1 AND folder_id = $2;',
          [clientId, folder.id]
        );
        if (hasFolderAccess.rows.length === 0) {
          await client.query(`
            INSERT INTO client_folder_access (client_id, folder_id, created_at)
            VALUES ($1, $2, NOW());
          `, [clientId, folder.id]);
        }
      }

      // Ensure all sidebar items are allowed for all clients
      const allItemsRes = await client.query('SELECT id FROM sidebar_items;');
      for (const item of allItemsRes.rows) {
        const hasItemAccess = await client.query(
          'SELECT id FROM client_item_access WHERE client_id = $1 AND item_id = $2;',
          [clientId, item.id]
        );
        if (hasItemAccess.rows.length === 0) {
          await client.query(`
            INSERT INTO client_item_access (client_id, item_id, created_at)
            VALUES ($1, $2, NOW());
          `, [clientId, item.id]);
        }
      }
    }

    await client.query('COMMIT;');
    console.log('Synchronization complete and committed successfully!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error during synchronization:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
