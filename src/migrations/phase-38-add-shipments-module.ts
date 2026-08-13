import { QueryInterface, QueryTypes } from 'sequelize';

export const phase = '38';
export const name = 'Add shipment_no and status columns, unique composite index, app_module, permissions, and sidebar item for Shipments';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  console.log('Running Migration Phase 38 - Setting up Shipments module...');

  // 1. Add columns to sales_contract_shipments
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS shipment_no INTEGER DEFAULT 1;
  `);

  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Scheduled';
  `);

  // 2. Backfill shipment_no sequentially per contract
  const shipments = await sequelize.query<any>(
    `SELECT id, sales_contract_id 
     FROM sales_contract_shipments 
     ORDER BY sales_contract_id, shipment_date ASC, id ASC`,
    { type: QueryTypes.SELECT }
  );

  const groups: { [key: number]: any[] } = {};
  for (const s of shipments) {
    if (!groups[s.sales_contract_id]) {
      groups[s.sales_contract_id] = [];
    }
    groups[s.sales_contract_id].push(s);
  }

  for (const contractId of Object.keys(groups)) {
    const groupShipments = groups[Number(contractId)];
    for (let i = 0; i < groupShipments.length; i++) {
      const s = groupShipments[i];
      const shipmentNo = i + 1;
      await sequelize.query(
        `UPDATE sales_contract_shipments SET shipment_no = :shipmentNo WHERE id = :id`,
        {
          replacements: { shipmentNo, id: s.id },
          type: QueryTypes.UPDATE
        }
      );
    }
  }

  // 3. Create composite unique index (if not exists)
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_contract_no 
    ON sales_contract_shipments (sales_contract_id, shipment_no);
  `);

  // 4. Ensure App Module 'Shipments' (ID 49) exists
  await sequelize.query(`
    INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
    VALUES (49, 'Shipments', 30, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'Shipments', sort_order = 30, "updatedAt" = NOW();
  `);

  // 5. Ensure Module Resource 'shipments' (ID 53) exists
  await sequelize.query(`
    INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
    VALUES (53, 'shipments', 'Shipments', 0, 49, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'shipments', display_name = 'Shipments', module_id = 49, "updatedAt" = NOW();
  `);

  // 6. Create standard & custom actions for shipments resource
  const shipmentActions = [
    { name: 'CREATE', sort: 10 },
    { name: 'VIEW', sort: 20 },
    { name: 'UPDATE', sort: 30 },
    { name: 'DELETE', sort: 40 },
    { name: 'FORCE_DELETE', sort: 50 },
    { name: 'EXPORT', sort: 60 },
    { name: 'PRINT', sort: 70 },
    { name: 'MANAGE_DOCUMENTS', sort: 80 }
  ];

  const shipmentsActionIds: number[] = [];

  for (const act of shipmentActions) {
    const [checkRes]: any = await sequelize.query(`
      SELECT id FROM resource_actions WHERE resource_id = 53 AND name = :actionName;
    `, { replacements: { actionName: act.name } });

    let actionId: number;
    if (checkRes.length > 0) {
      actionId = checkRes[0].id;
      await sequelize.query(`
        UPDATE resource_actions SET sort_order = :sortOrder, "updatedAt" = NOW() WHERE id = :actionId;
      `, { replacements: { sortOrder: act.sort, actionId } });
    } else {
      const [insertRes]: any = await sequelize.query(`
        INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
        VALUES (:actionName, :actionName, :sortOrder, 53, NOW(), NOW())
        RETURNING id;
      `, { replacements: { actionName: act.name, sortOrder: act.sort } });
      actionId = insertRes[0].id;
    }
    shipmentsActionIds.push(actionId);
  }

  // 7. Grant permission to Admin (1) and Client Admin (2) roles
  const targetRoles = [1, 2];
  for (const roleId of targetRoles) {
    const [roleExists]: any = await sequelize.query('SELECT id FROM roles WHERE id = :roleId;', { replacements: { roleId } });
    if (roleExists.length === 0) continue;

    for (const actionId of shipmentsActionIds) {
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

  for (const clientId of clientIds) {
    // Actions
    for (const actionId of shipmentsActionIds) {
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

    // Module
    const [hasModuleAccess]: any = await sequelize.query(
      'SELECT id FROM client_module_access WHERE client_id = :clientId AND module_id = 49;',
      { replacements: { clientId } }
    );
    if (hasModuleAccess.length === 0) {
      await sequelize.query(`
        INSERT INTO client_module_access (client_id, module_id, created_at)
        VALUES (:clientId, 49, NOW());
      `, { replacements: { clientId } });
    }
  }

  // 9. Add Shipments sidebar item under Sales folder
  const [salesFolder]: any = await sequelize.query(`
    SELECT id FROM sidebar_folders WHERE name = 'Sales' LIMIT 1;
  `);

  if (salesFolder.length > 0) {
    const folderId = salesFolder[0].id;
    const [existingItem]: any = await sequelize.query(`
      SELECT id FROM sidebar_items WHERE route = '/sales/shipments' LIMIT 1;
    `);

    let itemId: number;
    if (existingItem.length > 0) {
      itemId = existingItem[0].id;
      await sequelize.query(`
        UPDATE sidebar_items 
        SET name = 'Shipments', folder_id = :folderId, sort_order = 20, permission_link = 'shipments:view', "updatedAt" = NOW()
        WHERE id = :itemId;
      `, { replacements: { folderId, itemId } });
    } else {
      const [insertItemRes]: any = await sequelize.query(`
        INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
        VALUES ('Shipments', '/sales/shipments', 'Ship', :folderId, 20, true, 'shipments:view', NOW(), NOW())
        RETURNING id;
      `, { replacements: { folderId } });
      itemId = insertItemRes[0].id;
    }

    // Sync client access for the new item
    for (const clientId of clientIds) {
      const [hasItemAccess]: any = await sequelize.query(
        'SELECT id FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId;',
        { replacements: { clientId, itemId } }
      );
      if (hasItemAccess.length === 0) {
        await sequelize.query(`
          INSERT INTO client_item_access (client_id, item_id, created_at)
          VALUES (:clientId, :itemId, NOW());
        `, { replacements: { clientId, itemId } });
      }
    }
  }

  console.log('✅ Phase 38 - Shipments module setup completed successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  console.log('Rolling back Migration Phase 38...');

  // Remove sidebar items
  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/sales/shipments');`);
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/sales/shipments';`);

  // Remove RBAC records
  await sequelize.query(`DELETE FROM client_action_access WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 53);`);
  await sequelize.query(`DELETE FROM role_action_permissions WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 53);`);
  await sequelize.query(`DELETE FROM resource_actions WHERE resource_id = 53;`);
  await sequelize.query(`DELETE FROM module_resources WHERE id = 53;`);
  await sequelize.query(`DELETE FROM client_module_access WHERE module_id = 49;`);
  await sequelize.query(`DELETE FROM app_modules WHERE id = 49;`);

  // Drop index and columns
  await sequelize.query(`DROP INDEX IF EXISTS idx_shipment_contract_no;`);
  await sequelize.query(`ALTER TABLE sales_contract_shipments DROP COLUMN IF EXISTS status;`);
  await sequelize.query(`ALTER TABLE sales_contract_shipments DROP COLUMN IF EXISTS shipment_no;`);

  console.log('✅ Phase 38 - Shipments module setup rolled back successfully');
}
