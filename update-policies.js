const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'admin',
    database: process.env.DB_NAME || 'Agricom_db',
  });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    // Query employee details including userId
    const employeeRes = await client.query(`
      SELECT id, "userId", "firstName", "lastName", email
      FROM employees
      ORDER BY id ASC
    `);
    console.log('Employees in DB:', employeeRes.rows);

    // Query users in DB
    const usersRes = await client.query(`
      SELECT id, name, email, "clientId"
      FROM users
      ORDER BY id ASC
    `);
    console.log('Users in DB:', usersRes.rows);

  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
}

run();
