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
    
    // We want to check the target employee from the previous test: abc@gmail.com
    const empRes = await c.query(`SELECT e.id as emp_id FROM users u JOIN employees e ON u.id = e."userId" WHERE u.email = 'abc@gmail.com'`);
    if (empRes.rows.length === 0) return console.log('Emp not found');
    const empId = empRes.rows[0].emp_id;

    console.log("EMPLOYEE ID:", empId);

    // Fetch from attendance_records
    const recs = await c.query('SELECT id, date, "checkInTime", "checkOutTime", "attendanceStatus", "attendanceState", "totalHours" FROM attendance_records WHERE "employeeId" = $1 ORDER BY date DESC LIMIT 5', [empId]);
    console.log("RAW DB RECORDS:");
    console.table(recs.rows);

    // Fetch from attendance_exceptions
    const excs = await c.query('SELECT id, metadata, status, "createdAt" FROM attendance_exceptions WHERE "employeeId" = $1 ORDER BY id DESC LIMIT 5', [empId]);
    console.log("EXCEPTIONS:");
    for (let e of excs.rows) {
      console.log(`ID: ${e.id}, Status: ${e.status}, Metadata date: ${e.metadata.date}`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await c.end();
  }
}

run();
