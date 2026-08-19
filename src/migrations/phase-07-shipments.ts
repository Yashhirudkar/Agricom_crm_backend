import { QueryInterface, DataTypes, QueryTypes } from 'sequelize';

export const phase = '07';
export const name = 'Shipments Module & Navigation Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // ─── 1. sales_contract_shipments ─────────────────────────────────────────────
  await queryInterface.createTable(
    'sales_contract_shipments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      sales_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      shipment_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      shipment_reference: { type: DataTypes.STRING(100), allowNull: true },
      shipment_date: { type: DataTypes.DATEONLY, allowNull: false },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      no_of_containers: { type: DataTypes.INTEGER, allowNull: true },
      rate_per_mt: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      purchase_rate: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      forex: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      freight: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Scheduled' },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updated_at: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
    },
    { ifNotExists: true } as any,
  );

  // Ensure columns exist if table was previously created with partial columns
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS shipment_no INTEGER NOT NULL DEFAULT 1;
  `);
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS shipment_reference VARCHAR(100);
  `);
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Scheduled';
  `);

  // ─── 2. Indexes & Unique Constraints ────────────────────────────────────────
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_contract_shipments_shipment_ref 
    ON sales_contract_shipments (shipment_reference);
  `);

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_contract_no 
    ON sales_contract_shipments (sales_contract_id, shipment_no);
  `);

  // ─── 3. Idempotent App Module Seeding ('Shipments') ──────────────────────────
  await sequelize.query(`
    INSERT INTO app_modules (id, name, sort_order, "createdAt", "updatedAt")
    VALUES (49, 'Shipments', 30, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'Shipments', sort_order = 30, "updatedAt" = NOW();
  `);

  // ─── 4. Idempotent Module Resource Seeding ('shipments') ─────────────────────
  await sequelize.query(`
    INSERT INTO module_resources (id, name, display_name, sort_order, module_id, "createdAt", "updatedAt")
    VALUES (53, 'shipments', 'Shipments', 0, 49, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = 'shipments', display_name = 'Shipments', module_id = 49, "updatedAt" = NOW();
  `);

  // ─── 5. Idempotent Resource Actions Seeding ─────────────────────────────────
  const shipmentActions = [
    { name: 'CREATE', sort: 10 },
    { name: 'VIEW', sort: 20 },
    { name: 'UPDATE', sort: 30 },
    { name: 'DELETE', sort: 40 },
    { name: 'FORCE_DELETE', sort: 50 },
    { name: 'EXPORT', sort: 60 },
    { name: 'PRINT', sort: 70 },
    { name: 'MANAGE_DOCUMENTS', sort: 80 },
  ];

  const shipmentsActionIds: number[] = [];

  for (const act of shipmentActions) {
    const [checkRes]: any = await sequelize.query(
      `SELECT id FROM resource_actions WHERE resource_id = 53 AND name = :actionName;`,
      { replacements: { actionName: act.name } }
    );

    let actionId: number;
    if (checkRes.length > 0) {
      actionId = checkRes[0].id;
      await sequelize.query(
        `UPDATE resource_actions SET sort_order = :sortOrder, "updatedAt" = NOW() WHERE id = :actionId;`,
        { replacements: { sortOrder: act.sort, actionId } }
      );
    } else {
      const [insertRes]: any = await sequelize.query(
        `INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
         VALUES (:actionName, :actionName, :sortOrder, 53, NOW(), NOW())
         RETURNING id;`,
        { replacements: { actionName: act.name, sortOrder: act.sort } }
      );
      actionId = insertRes[0].id;
    }
    shipmentsActionIds.push(actionId);
  }

  // ─── 6. Grant Role Action Permissions (Roles 1 & 2 if exist) ───────────────
  const targetRoles = [1, 2];
  for (const roleId of targetRoles) {
    const [roleExists]: any = await sequelize.query(`SELECT id FROM roles WHERE id = :roleId;`, { replacements: { roleId } });
    if (roleExists.length === 0) continue;

    for (const actionId of shipmentsActionIds) {
      const [hasPerm]: any = await sequelize.query(
        `SELECT id FROM role_action_permissions WHERE role_id = :roleId AND resource_action_id = :actionId;`,
        { replacements: { roleId, actionId } }
      );
      if (hasPerm.length === 0) {
        await sequelize.query(
          `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
           VALUES (:roleId, :actionId, NOW(), NOW());`,
          { replacements: { roleId, actionId } }
        );
      }
    }
  }

  // ─── 7. Grant Client Module & Action Access ──────────────────────────────────
  const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`);
  const clientIds = clientsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
    for (const actionId of shipmentsActionIds) {
      const [hasAccess]: any = await sequelize.query(
        `SELECT id FROM client_action_access WHERE client_id = :clientId AND resource_action_id = :actionId;`,
        { replacements: { clientId, actionId } }
      );
      if (hasAccess.length === 0) {
        await sequelize.query(
          `INSERT INTO client_action_access (client_id, resource_action_id, created_at)
           VALUES (:clientId, :actionId, NOW());`,
          { replacements: { clientId, actionId } }
        );
      }
    }

    const [hasModuleAccess]: any = await sequelize.query(
      `SELECT id FROM client_module_access WHERE client_id = :clientId AND module_id = 49;`,
      { replacements: { clientId } }
    );
    if (hasModuleAccess.length === 0) {
      await sequelize.query(
        `INSERT INTO client_module_access (client_id, module_id, created_at)
         VALUES (:clientId, 49, NOW());`,
        { replacements: { clientId } }
      );
    }
  }

  // ─── 8. Idempotent Sidebar Item Seeding ('/sales/shipments') ────────────────
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
      await sequelize.query(
        `UPDATE sidebar_items 
         SET name = 'Shipments', folder_id = :folderId, sort_order = 20, permission_link = 'shipments:view', "updatedAt" = NOW()
         WHERE id = :itemId;`,
        { replacements: { folderId, itemId } }
      );
    } else {
      const [insertItemRes]: any = await sequelize.query(
        `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
         VALUES ('Shipments', '/sales/shipments', 'Ship', :folderId, 20, true, 'shipments:view', NOW(), NOW())
         RETURNING id;`,
        { replacements: { folderId } }
      );
      itemId = insertItemRes[0].id;
    }

    for (const clientId of clientIds) {
      const [hasItemAccess]: any = await sequelize.query(
        `SELECT id FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId;`,
        { replacements: { clientId, itemId } }
      );
      if (hasItemAccess.length === 0) {
        await sequelize.query(
          `INSERT INTO client_item_access (client_id, item_id, created_at)
           VALUES (:clientId, :itemId, NOW());`,
          { replacements: { clientId, itemId } }
        );
      }
    }
  }

  console.log('✅ Phase 07 - Shipments Module created and seeded successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/sales/shipments');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/sales/shipments';`).catch(() => { });

  await sequelize.query(`DELETE FROM client_action_access WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 53);`).catch(() => { });
  await sequelize.query(`DELETE FROM role_action_permissions WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id = 53);`).catch(() => { });
  await sequelize.query(`DELETE FROM resource_actions WHERE resource_id = 53;`).catch(() => { });
  await sequelize.query(`DELETE FROM module_resources WHERE id = 53;`).catch(() => { });
  await sequelize.query(`DELETE FROM client_module_access WHERE module_id = 49;`).catch(() => { });
  await sequelize.query(`DELETE FROM app_modules WHERE id = 49;`).catch(() => { });

  await sequelize.query(`DROP INDEX IF EXISTS idx_shipment_contract_no;`).catch(() => { });
  await sequelize.query(`DROP INDEX IF EXISTS idx_sales_contract_shipments_shipment_ref;`).catch(() => { });
  await queryInterface.dropTable('sales_contract_shipments').catch(() => { });

  console.log('✅ Phase 07 - Shipments Module dropped');
}
