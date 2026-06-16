const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin',
  database: 'Agricom_db',
});

async function run() {
  await client.connect();

  const res = await client.query(`
    SELECT r.name as role, p.resource, p.action 
    FROM role_permissions rp
    JOIN roles r ON rp."roleId" = r.id
    JOIN permissions p ON rp."permissionId" = p.id
    WHERE p.resource = 'notifications';
  `);
  console.table(res.rows);

  await client.end();
}

run().catch(console.error);
