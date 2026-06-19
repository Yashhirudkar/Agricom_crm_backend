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
    const res = await c.query('SELECT date, "checkInTime", "checkOutTime", "attendanceStatus" FROM attendance_records WHERE "employeeId" = 24 ORDER BY date DESC');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

run();
