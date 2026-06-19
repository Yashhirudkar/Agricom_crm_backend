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
    const res = await c.query('SELECT id, status, metadata, "createdAt", "attendanceRecordId" FROM attendance_exceptions WHERE "employeeId" = 24 ORDER BY id DESC LIMIT 10');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

run();
