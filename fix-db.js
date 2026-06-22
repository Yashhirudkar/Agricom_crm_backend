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
  
  await client.query(`
    ALTER TABLE sidebar_folders ADD COLUMN IF NOT EXISTS icon_color VARCHAR(50);
    ALTER TABLE sidebar_items ADD COLUMN IF NOT EXISTS icon_color VARCHAR(50);
  `);
  console.log('Added icon_color to sidebar_folders and sidebar_items if not exists');

  await client.query(`
    DROP TABLE IF EXISTS ui_config_versions CASCADE;
    DROP TABLE IF EXISTS ui_configurations CASCADE;
    DROP TABLE IF EXISTS ui_entity_registry CASCADE;
    DROP TABLE IF EXISTS ui_themes CASCADE;
    DROP TABLE IF EXISTS ui_media_assets CASCADE;
    DROP TABLE IF EXISTS ui_icons CASCADE;
  `);
  console.log('Dropped old UI tables');
  
  await client.end();
}

run().catch(console.error);
