const { Client } = require('pg');

async function run() {
  const c = new Client({
    user: 'postgres',
    password: 'admin',
    database: 'Agricom_db',
    host: 'localhost',
    port: 5432
  });

  try {
    await c.connect();
    const res = await c.query('SELECT u.id, u.email, e.id as employee_id FROM users u LEFT JOIN employees e ON e."userId" = u.id WHERE u.email=\'admin@agricom.com\'');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

run();
