import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '15';
export const name = 'Enterprise Logistics & Freight Management Module Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Create Sequences for LOG/YYYY/###### and FQ/YYYY/######
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS logistics_no_seq START 1;`).catch(() => { });
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS freight_quotes_no_seq START 1;`).catch(() => { });

  // 2. Create logistics Table
  await queryInterface.createTable(
    'logistics',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      logistics_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      enquiry_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'enquiries', key: 'id' },
        onDelete: 'CASCADE',
      },
      mode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Domestic' },
      transport_mode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Road' },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Pending' },
      selected_freight_id: { type: DataTypes.INTEGER, allowNull: true },
      estimated_dispatch_date: { type: DataTypes.DATEONLY, allowNull: true },
      estimated_arrival_date: { type: DataTypes.DATEONLY, allowNull: true },
      actual_dispatch_date: { type: DataTypes.DATEONLY, allowNull: true },
      actual_arrival_date: { type: DataTypes.DATEONLY, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_logistics_enquiry_id ON logistics (enquiry_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics (status);
  `);

  // 3. Create freight_quotes Table
  await queryInterface.createTable(
    'freight_quotes',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      quote_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      logistics_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'logistics', key: 'id' },
        onDelete: 'CASCADE',
      },
      quote_date: { type: DataTypes.DATEONLY, allowNull: false },
      seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partners', key: 'id' },
        onDelete: 'RESTRICT',
      },
      carrier_reference_no: { type: DataTypes.STRING(100), allowNull: true },
      vehicle_type: { type: DataTypes.STRING(50), allowNull: true },
      container_type: { type: DataTypes.STRING(50), allowNull: true },
      shipping_line: { type: DataTypes.STRING(150), allowNull: true },
      contact_person: { type: DataTypes.STRING(100), allowNull: true },
      contact_number: { type: DataTypes.STRING(50), allowNull: true },
      freight_amount: { type: DataTypes.DECIMAL(15, 4), allowNull: false },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      fuel_charges: { type: DataTypes.DECIMAL(15, 4), allowNull: true, defaultValue: 0 },
      additional_charges: { type: DataTypes.DECIMAL(15, 4), allowNull: true, defaultValue: 0 },
      transit_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      validity_date: { type: DataTypes.DATEONLY, allowNull: false },
      payment_terms: { type: DataTypes.STRING(255), allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      is_preferred: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_rejected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      pol: { type: DataTypes.STRING(100), allowNull: true },
      pod: { type: DataTypes.STRING(100), allowNull: true },
      etd: { type: DataTypes.DATE, allowNull: true },
      eta: { type: DataTypes.DATE, allowNull: true },
      free_days: { type: DataTypes.INTEGER, allowNull: true },
      cutoff_date: { type: DataTypes.DATE, allowNull: true },
      vessel: { type: DataTypes.STRING(100), allowNull: true },
      voyage: { type: DataTypes.STRING(50), allowNull: true },
      container_size: { type: DataTypes.STRING(50), allowNull: true },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_freight_quotes_logistics_id ON freight_quotes (logistics_id);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_freight_quotes_is_preferred ON freight_quotes (is_preferred);
  `);

  // 4. Add foreign key to logistics for selected_freight_id
  await sequelize.query(`
    ALTER TABLE logistics 
    ADD CONSTRAINT fk_logistics_selected_freight_id 
    FOREIGN KEY (selected_freight_id) 
    REFERENCES freight_quotes(id) 
    ON DELETE SET NULL;
  `).catch(() => { });

  // 5. Add columns/relationships to existing tables
  // Add enquiry_id (UUID) to sales_contracts table
  await sequelize.query(`
    ALTER TABLE sales_contracts 
    ADD COLUMN IF NOT EXISTS enquiry_id UUID REFERENCES enquiries(id) ON DELETE SET NULL;
  `).catch(() => { });

  // Add logistics_id (INTEGER) to sales_contract_shipments table
  await sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS logistics_id INTEGER REFERENCES logistics(id) ON DELETE SET NULL;
  `).catch(() => { });

  // Add contact_person (VARCHAR(100)) to freight_quotes table if missing
  await sequelize.query(`
    ALTER TABLE freight_quotes 
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100);
  `).catch(() => { });

  // Add entity_type & entity_id to attachments table if missing
  await sequelize.query(`
    ALTER TABLE attachments 
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS entity_id INTEGER;
  `).catch(() => { });

  // 6. RBAC Configuration: App Module
  const [appModuleRes]: any = await sequelize.query(`
    SELECT id FROM app_modules WHERE name = 'Logistics' LIMIT 1;
  `);
  let targetModuleId: number;
  if (appModuleRes.length > 0) {
    targetModuleId = appModuleRes[0].id;
  } else {
    const [insertModuleRes]: any = await sequelize.query(`
      INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
      VALUES ('Logistics', 40, NOW(), NOW())
      RETURNING id;
    `);
    targetModuleId = insertModuleRes[0].id;
  }

  // 7. RBAC Configuration: Module Resource
  const [modResourceRes]: any = await sequelize.query(`
    SELECT id FROM module_resources WHERE name = 'logistics' LIMIT 1;
  `);
  let targetResourceId: number;
  if (modResourceRes.length > 0) {
    targetResourceId = modResourceRes[0].id;
    await sequelize.query(
      `UPDATE module_resources SET display_name = 'Logistics & Freight', module_id = :targetModuleId, "updatedAt" = NOW() WHERE id = :targetResourceId;`,
      { replacements: { targetModuleId, targetResourceId } },
    );
  } else {
    const [insertResourceRes]: any = await sequelize.query(`
      INSERT INTO module_resources (name, display_name, sort_order, module_id, "createdAt", "updatedAt")
      VALUES ('logistics', 'Logistics & Freight', 0, :targetModuleId, NOW(), NOW())
      RETURNING id;
    `, { replacements: { targetModuleId } });
    targetResourceId = insertResourceRes[0].id;
  }

  // 8. RBAC Configuration: Resource Actions
  const logisticsActions = [
    { name: 'CREATE', sort: 10 },
    { name: 'VIEW', sort: 20 },
    { name: 'UPDATE', sort: 30 },
    { name: 'DELETE', sort: 40 },
  ];

  const actionIds: number[] = [];

  for (const act of logisticsActions) {
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
    actionIds.push(actionId);
  }

  // 9. Grant Role Permissions (Roles 1, 2 & 3)
  for (const roleId of [1, 2, 3]) {
    const [roleExists]: any = await sequelize.query(`SELECT id FROM roles WHERE id = :roleId;`, { replacements: { roleId } });
    if (roleExists.length === 0) continue;

    for (const actionId of actionIds) {
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

  // 10. Grant Client Action Access
  const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`);
  const clientIds = clientsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
    for (const actionId of actionIds) {
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

  // 11. Seed Sidebar Folder & Item
  const [logisticsFolder]: any = await sequelize.query(`
    SELECT id FROM sidebar_folders WHERE name = 'Logistics' LIMIT 1;
  `);

  let folderId: number;
  if (logisticsFolder.length > 0) {
    folderId = logisticsFolder[0].id;
  } else {
    const [insertFolderRes]: any = await sequelize.query(`
      INSERT INTO sidebar_folders (name, icon_name, sort_order, is_collapsible, "createdAt", "updatedAt")
      VALUES ('Logistics', 'Truck', 40, true, NOW(), NOW())
      RETURNING id;
    `);
    folderId = insertFolderRes[0].id;
  }

  const [existingItem]: any = await sequelize.query(`
    SELECT id FROM sidebar_items WHERE route = '/logistics/transport-management' LIMIT 1;
  `);

  let itemId: number;
  if (existingItem.length > 0) {
    itemId = existingItem[0].id;
    await sequelize.query(
      `UPDATE sidebar_items
       SET name = 'Transport Management', folder_id = :folderId, sort_order = 10,
           permission_link = 'logistics:view', "updatedAt" = NOW()
       WHERE id = :itemId;`,
      { replacements: { folderId, itemId } },
    );
  } else {
    const [insertItemRes]: any = await sequelize.query(
      `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
       VALUES ('Transport Management', '/logistics/transport-management', 'Truck', :folderId, 10, true, 'logistics:view', NOW(), NOW())
       RETURNING id;`,
      { replacements: { folderId } },
    );
    itemId = insertItemRes[0].id;
  }

  for (const clientId of clientIds) {
    // Grant Folder Access
    const [hasFolderAccess]: any = await sequelize.query(
      `SELECT id FROM client_folder_access WHERE client_id = :clientId AND folder_id = :folderId;`,
      { replacements: { clientId, folderId } },
    );
    if (hasFolderAccess.length === 0) {
      await sequelize.query(
        `INSERT INTO client_folder_access (client_id, folder_id, created_at)
         VALUES (:clientId, :folderId, NOW());`,
        { replacements: { clientId, folderId } },
      );
    }

    // Grant Item Access
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

  console.log('✅ Phase 15 - Logistics Module created and seeded successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // Cleanup Sidebar Access & Items
  await sequelize.query(`DELETE FROM client_folder_access WHERE folder_id IN (SELECT id FROM sidebar_folders WHERE name = 'Logistics');`).catch(() => { });
  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/logistics/transport-management');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/logistics/transport-management';`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_folders WHERE name = 'Logistics';`).catch(() => { });

  // Cleanup RBAC Actions & Permissions
  await sequelize.query(`DELETE FROM client_action_access WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'logistics'));`).catch(() => { });
  await sequelize.query(`DELETE FROM role_action_permissions WHERE resource_action_id IN (SELECT id FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'logistics'));`).catch(() => { });
  await sequelize.query(`DELETE FROM resource_actions WHERE resource_id IN (SELECT id FROM module_resources WHERE name = 'logistics');`).catch(() => { });
  await sequelize.query(`DELETE FROM module_resources WHERE name = 'logistics';`).catch(() => { });
  await sequelize.query(`DELETE FROM client_module_access WHERE module_id IN (SELECT id FROM app_modules WHERE name = 'Logistics');`).catch(() => { });
  await sequelize.query(`DELETE FROM app_modules WHERE name = 'Logistics';`).catch(() => { });

  // Remove columns from existing tables
  await sequelize.query(`ALTER TABLE sales_contract_shipments DROP COLUMN IF EXISTS logistics_id;`).catch(() => { });
  await sequelize.query(`ALTER TABLE sales_contracts DROP COLUMN IF EXISTS enquiry_id;`).catch(() => { });

  // Drop tables
  await sequelize.query(`ALTER TABLE logistics DROP CONSTRAINT IF EXISTS fk_logistics_selected_freight_id;`).catch(() => { });
  await queryInterface.dropTable('freight_quotes').catch(() => { });
  await queryInterface.dropTable('logistics').catch(() => { });

  // Drop Sequences
  await sequelize.query(`DROP SEQUENCE IF EXISTS freight_quotes_no_seq;`).catch(() => { });
  await sequelize.query(`DROP SEQUENCE IF EXISTS logistics_no_seq;`).catch(() => { });

  console.log('✅ Phase 15 - Logistics Module reverted');
}
