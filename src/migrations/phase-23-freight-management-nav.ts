import { QueryInterface } from 'sequelize';

export const phase = '23';
export const name = 'Freight Management Centralized Repository Nav Item';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // Find Logistics sidebar folder
  const [logisticsFolder]: any = await sequelize.query(`
    SELECT id FROM sidebar_folders WHERE name = 'Logistics' LIMIT 1;
  `);

  if (logisticsFolder.length === 0) {
    console.warn('⚠️  Phase 23 - Logistics sidebar folder not found, skipping nav item creation.');
    return;
  }

  const folderId = logisticsFolder[0].id;

  // Insert or update the Freight Management sidebar item
  const [existingItem]: any = await sequelize.query(`
    SELECT id FROM sidebar_items WHERE route = '/logistics/freight-management' LIMIT 1;
  `);

  let itemId: number;
  if (existingItem.length > 0) {
    itemId = existingItem[0].id;
    await sequelize.query(
      `UPDATE sidebar_items
       SET name = 'Freight Management', folder_id = :folderId, sort_order = 20,
           icon_name = 'Package', permission_link = 'logistics:view', "updatedAt" = NOW()
       WHERE id = :itemId;`,
      { replacements: { folderId, itemId } },
    );
  } else {
    const [insertItemRes]: any = await sequelize.query(
      `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
       VALUES ('Freight Management', '/logistics/freight-management', 'Package', :folderId, 20, true, 'logistics:view', NOW(), NOW())
       RETURNING id;`,
      { replacements: { folderId } },
    );
    itemId = insertItemRes[0].id;
  }

  // Grant item access to all clients
  const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`);
  const clientIds = clientsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
    const [hasItemAccess]: any = await sequelize.query(
      `SELECT id FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId;`,
      { replacements: { clientId, itemId } },
    );
    if (hasItemAccess.length === 0) {
      await sequelize.query(
        `INSERT INTO client_item_access (client_id, item_id, created_at)
         VALUES (:clientId, :itemId, NOW());`,
        { replacements: { clientId, itemId } },
      );
    }
  }

  console.log('✅ Phase 23 - Freight Management nav item created under Logistics folder');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/logistics/freight-management');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/logistics/freight-management';`).catch(() => { });
  console.log('✅ Phase 23 - Freight Management nav item removed');
}
