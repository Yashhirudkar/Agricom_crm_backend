const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  password: 'admin',
  host: 'localhost',
  port: 5432,
  database: 'Agricom_db'
});

async function run() {
  await client.connect();
  console.log('Connected to DB');
  
  // Find the folder
  const res = await client.query(`SELECT id, name FROM sidebar_folders WHERE name = 'UI CONFIG' OR name = 'UI Config' OR name ILIKE '%ui config%';`);
  
  if (res.rows.length > 0) {
    for (const row of res.rows) {
      console.log(`Found folder: ${row.name} (ID: ${row.id})`);
      
      // Delete items
      const itemsRes = await client.query(`DELETE FROM sidebar_items WHERE folder_id = $1 RETURNING name;`, [row.id]);
      console.log(`Deleted items:`, itemsRes.rows.map(r => r.name));
      
      // Delete folder
      await client.query(`DELETE FROM sidebar_folders WHERE id = $1;`, [row.id]);
      console.log(`Deleted folder: ${row.name}`);
    }
  } else {
    console.log('No UI CONFIG folder found in sidebar_folders.');
    
    // Check if they are just items without a folder or in a different folder
    const itemsRes = await client.query(`DELETE FROM sidebar_items WHERE name IN ('Icons', 'Themes', 'UI Config') RETURNING name;`);
    if (itemsRes.rows.length > 0) {
      console.log(`Deleted items directly:`, itemsRes.rows.map(r => r.name));
    } else {
      console.log('No UI CONFIG items found.');
    }
  }
  
  await client.end();
}

run().catch(console.error);
