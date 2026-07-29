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
  console.log('--- EMPLOYEES LIKE Yash or Nikita or Borkar ---');
  const resEmp = await client.query(`
    SELECT id, "userId", "companyId", "firstName", "lastName", email, status 
    FROM employees 
    WHERE "firstName" ILIKE '%yash%' OR "lastName" ILIKE '%yash%' OR "firstName" ILIKE '%nikita%' OR "lastName" ILIKE '%nikita%' OR "firstName" ILIKE '%borkar%' OR "lastName" ILIKE '%borkar%';
  `);
  console.log(JSON.stringify(resEmp.rows, null, 2));

  console.log('--- USERS LIKE Yash or Nikita or Borkar ---');
  const resUsers = await client.query(`
    SELECT id, name, email, "clientId", status 
    FROM users 
    WHERE name ILIKE '%yash%' OR name ILIKE '%nikita%' OR name ILIKE '%borkar%' OR email ILIKE '%yash%' OR email ILIKE '%nikita%' OR email ILIKE '%borkar%';
  `);
  console.log(JSON.stringify(resUsers.rows, null, 2));

  console.log('--- ALL EMPLOYEES COUNT ---');
  const countEmp = await client.query('SELECT count(*) FROM employees;');
  console.log(countEmp.rows[0]);

  console.log('--- ALL USERS COUNT ---');
  const countUsers = await client.query('SELECT count(*) FROM users;');
  console.log(countUsers.rows[0]);

  await client.end();
}

run().catch(console.error);
