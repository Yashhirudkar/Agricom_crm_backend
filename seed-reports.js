const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Agricom_db1',
  password: 'admin',
  port: 5432,
});

async function run() {
  await client.connect();

  try {
    // Check if Reports folder exists
    const folderRes = await client.query(`SELECT id FROM sidebar_folders WHERE name = 'Reports'`);
    let folderId;

    if (folderRes.rows.length === 0) {
      const res = await client.query(`
        INSERT INTO sidebar_folders (name, icon_name, sort_order, is_collapsible, created_at, updated_at) 
        VALUES ('Reports', 'bar-chart-2', 100, true, NOW(), NOW()) RETURNING id;
      `);
      folderId = res.rows[0].id;
      console.log('Created Reports folder:', folderId);
    } else {
      folderId = folderRes.rows[0].id;
      console.log('Reports folder already exists:', folderId);
    }

    // Check if Sales Report item exists
    const itemRes = await client.query(`SELECT id FROM sidebar_items WHERE name = 'Sales Report'`);
    if (itemRes.rows.length === 0) {
      await client.query(`
        INSERT INTO sidebar_items (folder_id, name, route, icon_name, permission_link, sort_order, created_at, updated_at)
        VALUES ($1, 'Sales Report', '/reports/sales', 'trending-up', 'always:allow', 1, NOW(), NOW());
      `, [folderId]);
      console.log('Created Sales Report item');
    } else {
      console.log('Sales Report item already exists');
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
