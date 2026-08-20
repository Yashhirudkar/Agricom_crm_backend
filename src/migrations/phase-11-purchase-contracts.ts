import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '11';
export const name = 'Purchase Contract Module';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // ─── 1. purchase_contracts ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'purchase_contracts',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      sales_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contracts', key: 'id' },
        onDelete: 'RESTRICT',
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'Draft',
      },
      purchase_type: { type: DataTypes.STRING(30), allowNull: true },
      seller_contract_no: { type: DataTypes.STRING(100), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      updated_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    ALTER TABLE purchase_contracts
    ADD COLUMN IF NOT EXISTS seller_contract_no VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT;
  `);

  await sequelize.query(`
    ALTER TABLE sales_contracts
    ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'Export';
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_contracts_sales_contract_id
    ON purchase_contracts (sales_contract_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_contracts_status
    ON purchase_contracts (status);
  `);

  // ─── 2. purchase_contract_shipments (pure junction) ──────────────────────────
  await queryInterface.createTable(
    'purchase_contract_shipments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      purchase_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchase_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      shipment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'sales_contract_shipments', key: 'id' },
        onDelete: 'RESTRICT',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_shipments_unique
    ON purchase_contract_shipments (purchase_contract_id, shipment_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pc_shipments_shipment_id
    ON purchase_contract_shipments (shipment_id);
  `);

  // ─── 3. purchase_contract_required_documents ─────────────────────────────────
  await queryInterface.createTable(
    'purchase_contract_required_documents',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      purchase_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchase_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      trade_document_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'trade_documents', key: 'id' },
        onDelete: 'RESTRICT',
      },
      attachment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'attachments', key: 'id' },
        onDelete: 'SET NULL',
      },
      uploaded_by: { type: DataTypes.INTEGER, allowNull: true },
      uploaded_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_required_docs_unique
    ON purchase_contract_required_documents (purchase_contract_id, trade_document_id);
  `);

  // ─── 4. purchase_contract_activities ─────────────────────────────────────────
  await queryInterface.createTable(
    'purchase_contract_activities',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      purchase_contract_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchase_contracts', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      performed_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pc_activities_contract_id
    ON purchase_contract_activities (purchase_contract_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_pc_activities_created_at
    ON purchase_contract_activities (created_at DESC);
  `);

  // ─── 5. RBAC: App Module ──────────────────────────────────────────────────────
  const [appModuleRes]: any = await sequelize.query(`
    SELECT id FROM app_modules WHERE name = 'Purchase Contracts' LIMIT 1;
  `);
  let targetModuleId: number;
  if (appModuleRes.length > 0) {
    targetModuleId = appModuleRes[0].id;
  } else {
    const [insertModuleRes]: any = await sequelize.query(`
      INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
      VALUES ('Purchase Contracts', 35, NOW(), NOW())
      RETURNING id;
    `);
    targetModuleId = insertModuleRes[0].id;
  }

  // ─── 6. RBAC: Module Resource ─────────────────────────────────────────────────
  const [modResourceRes]: any = await sequelize.query(`
    SELECT id FROM module_resources WHERE name = 'purchase-contracts' LIMIT 1;
  `);
  let targetResourceId: number;
  if (modResourceRes.length > 0) {
    targetResourceId = modResourceRes[0].id;
    await sequelize.query(
      `UPDATE module_resources SET display_name = 'Purchase Contracts', module_id = :targetModuleId, "updatedAt" = NOW() WHERE id = :targetResourceId;`,
      { replacements: { targetModuleId, targetResourceId } },
    );
  } else {
    const [insertResourceRes]: any = await sequelize.query(`
      INSERT INTO module_resources (name, display_name, sort_order, module_id, "createdAt", "updatedAt")
      VALUES ('purchase-contracts', 'Purchase Contracts', 0, :targetModuleId, NOW(), NOW())
      RETURNING id;
    `, { replacements: { targetModuleId } });
    targetResourceId = insertResourceRes[0].id;
  }

  // ─── 7. RBAC: Resource Actions ───────────────────────────────────────────────
  const pcActions = [
    { name: 'CREATE', sort: 10 },
    { name: 'VIEW', sort: 20 },
    { name: 'UPDATE', sort: 30 },
    { name: 'DELETE', sort: 40 },
    { name: 'EXPORT', sort: 50 },
    { name: 'MANAGE_DOCUMENTS', sort: 60 },
  ];

  const pcActionIds: number[] = [];

  for (const act of pcActions) {
    const [checkRes]: any = await sequelize.query(
      `SELECT id FROM resource_actions WHERE resource_id = :targetResourceId AND name = :actionName;`,
      { replacements: { targetResourceId, actionName: act.name } },
    );

    let actionId: number;
    if (checkRes.length > 0) {
      actionId = checkRes[0].id;
      await sequelize.query(
        `UPDATE resource_actions SET sort_order = :sortOrder, "updatedAt" = NOW() WHERE id = :actionId;`,
        { replacements: { sortOrder: act.sort, actionId } },
      );
    } else {
      const [insertRes]: any = await sequelize.query(
        `INSERT INTO resource_actions (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
         VALUES (:actionName, :actionName, :sortOrder, :targetResourceId, NOW(), NOW())
         RETURNING id;`,
        { replacements: { actionName: act.name, sortOrder: act.sort, targetResourceId } },
      );
      actionId = insertRes[0].id;
    }
    pcActionIds.push(actionId);
  }

  // ─── 8. Grant Role Permissions (Roles 1 & 2) ─────────────────────────────────
  for (const roleId of [1, 2]) {
    const [roleExists]: any = await sequelize.query(`SELECT id FROM roles WHERE id = :roleId;`, { replacements: { roleId } });
    if (roleExists.length === 0) continue;

    for (const actionId of pcActionIds) {
      const [hasPerm]: any = await sequelize.query(
        `SELECT id FROM role_action_permissions WHERE role_id = :roleId AND resource_action_id = :actionId;`,
        { replacements: { roleId, actionId } },
      );
      if (hasPerm.length === 0) {
        await sequelize.query(
          `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
           VALUES (:roleId, :actionId, NOW(), NOW());`,
          { replacements: { roleId, actionId } },
        );
      }
    }
  }

  // ─── 9. Grant Client Action Access ───────────────────────────────────────────
  const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`);
  const clientIds = clientsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
    for (const actionId of pcActionIds) {
      const [hasAccess]: any = await sequelize.query(
        `SELECT id FROM client_action_access WHERE client_id = :clientId AND resource_action_id = :actionId;`,
        { replacements: { clientId, actionId } },
      );
      if (hasAccess.length === 0) {
        await sequelize.query(
          `INSERT INTO client_action_access (client_id, resource_action_id, created_at)
           VALUES (:clientId, :actionId, NOW());`,
          { replacements: { clientId, actionId } },
        );
      }
    }

    const [hasModuleAccess]: any = await sequelize.query(
      `SELECT id FROM client_module_access WHERE client_id = :clientId AND module_id = :targetModuleId;`,
      { replacements: { clientId, targetModuleId } },
    );
    if (hasModuleAccess.length === 0) {
      await sequelize.query(
        `INSERT INTO client_module_access (client_id, module_id, created_at)
         VALUES (:clientId, :targetModuleId, NOW());`,
        { replacements: { clientId, targetModuleId } },
      );
    }
  }

  // ─── 10. Sidebar Item ────────────────────────────────────────────────────────
  const [salesFolder]: any = await sequelize.query(`
    SELECT id FROM sidebar_folders WHERE name = 'Sales' LIMIT 1;
  `);

  if (salesFolder.length > 0) {
    const folderId = salesFolder[0].id;
    const [existingItem]: any = await sequelize.query(`
      SELECT id FROM sidebar_items WHERE route = '/sales/purchase-contracts' LIMIT 1;
    `);

    let itemId: number;
    if (existingItem.length > 0) {
      itemId = existingItem[0].id;
      await sequelize.query(
        `UPDATE sidebar_items
         SET name = 'Purchase Contracts', folder_id = :folderId, sort_order = 30,
             permission_link = 'purchase-contracts:view', "updatedAt" = NOW()
         WHERE id = :itemId;`,
        { replacements: { folderId, itemId } },
      );
    } else {
      const [insertItemRes]: any = await sequelize.query(
        `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
         VALUES ('Purchase Contracts', '/sales/purchase-contracts', 'FileText', :folderId, 30, true, 'purchase-contracts:view', NOW(), NOW())
         RETURNING id;`,
        { replacements: { folderId } },
      );
      itemId = insertItemRes[0].id;
    }

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
  }

  console.log('✅ Phase 11 - Purchase Contract Module created and seeded successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/sales/purchase-contracts');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/sales/purchase-contracts';`).catch(() => { });
  await sequelize.query(`DELETE FROM client_action_access WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'purchase-contracts'));`).catch(() => { });
  await sequelize.query(`DELETE FROM role_action_permissions WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'purchase-contracts'));`).catch(() => { });
  await sequelize.query(`DELETE FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'purchase-contracts');`).catch(() => { });
  await sequelize.query(`DELETE FROM module_resources WHERE name = 'purchase-contracts';`).catch(() => { });
  await sequelize.query(`DELETE FROM client_module_access WHERE module_id IN (SELECT id FROM app_modules WHERE name = 'Purchase Contracts');`).catch(() => { });
  await sequelize.query(`DELETE FROM app_modules WHERE name = 'Purchase Contracts';`).catch(() => { });

  await sequelize.query(`DROP INDEX IF EXISTS idx_pc_activities_created_at;`).catch(() => { });
  await sequelize.query(`DROP INDEX IF EXISTS idx_pc_activities_contract_id;`).catch(() => { });
  await queryInterface.dropTable('purchase_contract_activities').catch(() => { });

  await sequelize.query(`DROP INDEX IF EXISTS idx_pc_required_docs_unique;`).catch(() => { });
  await queryInterface.dropTable('purchase_contract_required_documents').catch(() => { });

  await sequelize.query(`DROP INDEX IF EXISTS idx_pc_shipments_unique;`).catch(() => { });
  await sequelize.query(`DROP INDEX IF EXISTS idx_pc_shipments_shipment_id;`).catch(() => { });
  await queryInterface.dropTable('purchase_contract_shipments').catch(() => { });

  await sequelize.query(`DROP INDEX IF EXISTS idx_purchase_contracts_status;`).catch(() => { });
  await sequelize.query(`DROP INDEX IF EXISTS idx_purchase_contracts_sales_contract_id;`).catch(() => { });
  await queryInterface.dropTable('purchase_contracts').catch(() => { });

  console.log('✅ Phase 11 - Purchase Contract Module dropped');
}
