import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '19';
export const name = 'Monthly Stock Summary Module Schema & Sidebar Setup';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Create monthly_stock_summaries Table
  await queryInterface.createTable(
    'monthly_stock_summaries',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false }, // 1 = Jan, 12 = Dec
      year: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Draft' },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'SET NULL',
      },
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
      published_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      published_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_stock_summary_month_year_company 
    ON monthly_stock_summaries (company_id, month, year) 
    WHERE deleted_at IS NULL;
  `).catch(() => { });

  // 2. Create monthly_stock_summary_countries Relational Bridge Table
  await queryInterface.createTable(
    'monthly_stock_summary_countries',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      summary_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'monthly_stock_summaries', key: 'id' },
        onDelete: 'CASCADE',
      },
      iso2_code: { type: DataTypes.STRING(10), allowNull: false },
      country_name: { type: DataTypes.STRING(100), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_mss_countries_summary_id ON monthly_stock_summary_countries (summary_id);
  `).catch(() => { });

  // 3. Seed Sidebar Item under Logistics Folder
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
    SELECT id FROM sidebar_items WHERE route = '/logistics/monthly-stock-summary' LIMIT 1;
  `);

  let itemId: number;
  if (existingItem.length > 0) {
    itemId = existingItem[0].id;
    await sequelize.query(
      `UPDATE sidebar_items
       SET name = 'Monthly Stock Summary', folder_id = :folderId, sort_order = 20,
           permission_link = 'logistics:view', "updatedAt" = NOW()
       WHERE id = :itemId;`,
      { replacements: { folderId, itemId } },
    );
  } else {
    const [insertItemRes]: any = await sequelize.query(
      `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
       VALUES ('Monthly Stock Summary', '/logistics/monthly-stock-summary', 'FileText', :folderId, 20, true, 'logistics:view', NOW(), NOW())
       RETURNING id;`,
      { replacements: { folderId } },
    );
    itemId = insertItemRes[0].id;
  }

  // 4. Grant Client Access
  const [clientsRes]: any = await sequelize.query(`SELECT id FROM clients;`);
  const clientIds = clientsRes.map((r: any) => r.id);

  for (const clientId of clientIds) {
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

  console.log('✅ Phase 19 - Monthly Stock Summary Module created and seeded successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // Cleanup Sidebar Access & Items
  await sequelize.query(`DELETE FROM client_item_access WHERE item_id IN (SELECT id FROM sidebar_items WHERE route = '/logistics/monthly-stock-summary');`).catch(() => { });
  await sequelize.query(`DELETE FROM sidebar_items WHERE route = '/logistics/monthly-stock-summary';`).catch(() => { });

  // Drop Tables
  await queryInterface.dropTable('monthly_stock_summary_countries').catch(() => { });
  await queryInterface.dropTable('monthly_stock_summaries').catch(() => { });

  console.log('✅ Phase 19 - Monthly Stock Summary Module reverted');
}
