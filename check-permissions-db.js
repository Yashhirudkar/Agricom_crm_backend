const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'Agricom_db',
});

async function run() {
  await client.connect();

  console.log('--- ACTION ID 152 ---');
  const res = await client.query(`
    SELECT ra.id, ra.name as action_name, ra.display_name, mr.name as resource_name 
    FROM resource_actions ra
    JOIN module_resources mr ON ra.resource_id = mr.id
    WHERE ra.id = 152;
  `);
  console.log(res.rows);

  console.log('--- CLIENT ACTION ACCESS FOR ID 152 ---');
  const access = await client.query(`
    SELECT cia.*, c.name as client_name 
    FROM client_action_access cia
    JOIN clients c ON cia.client_id = c.id
    WHERE cia.resource_action_id = 152;
  `);
  console.log(access.rows);

  await client.end();
}

run().catch(console.error);
