const { Client } = require('pg');

async function run() {
  const client = new Client({
    user: 'postgres',
    password: 'admin',
    host: 'localhost',
    port: 5432,
    database: 'Agricom_db'
  });

  await client.connect();
  console.log('Connected to DB');
  
  await client.query(`
    ALTER TABLE sidebar_items ADD COLUMN IF NOT EXISTS use_folder_color BOOLEAN DEFAULT true;
  `);
  console.log('Added use_folder_color to sidebar_items');
  
  await client.end();
}

run().catch(console.error);
