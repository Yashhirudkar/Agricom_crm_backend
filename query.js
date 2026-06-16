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

  console.log('--- 1. exact output of: SELECT resource, action FROM permissions ORDER BY resource, action; ---');
  const res1 = await client.query('SELECT resource, action FROM permissions ORDER BY resource, action;');
  console.table(res1.rows);

  console.log('\n--- 2. legacy permissions check ---');
  const res2 = await client.query(`
    SELECT resource, action FROM permissions 
    WHERE resource IN ('manager', 'branches', 'attendance', 'payroll')
  `);
  console.table(res2.rows);

  console.log('\n--- 5. Count total permissions in DB ---');
  const res3 = await client.query('SELECT count(*) FROM permissions');
  console.log('Total:', res3.rows[0].count);

  console.log('\n--- 6. Confirm CRM module permissions exist in DB ---');
  const res4 = await client.query(`
    SELECT DISTINCT resource FROM permissions 
    WHERE resource ILIKE '%client%' OR resource ILIKE '%crm%' OR resource IN ('leads', 'deals', 'contacts')
  `);
  console.table(res4.rows);

  await client.end();
}

run().catch(console.error);
