const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'Agricom_db1',
});

async function run() {
  await client.connect();
  console.log('--- FINDING ARCHANA ---');
  const resEmp = await client.query(`
    SELECT id, "firstName", "lastName", "companyId", status 
    FROM employees 
    WHERE "firstName" ILIKE '%archana%' OR "lastName" ILIKE '%archana%';
  `);
  console.log('Employees:', JSON.stringify(resEmp.rows, null, 2));

  if (resEmp.rows.length === 0) {
    console.log('No employee found with name Archana');
    await client.end();
    return;
  }

  const empId = resEmp.rows[0].id;

  console.log(`--- ATTENDANCE RECORDS FOR EMPLOYEE ID ${empId} ON 2026-08-05 ---`);
  const resRecords = await client.query(`
    SELECT * 
    FROM attendance_records 
    WHERE "employeeId" = $1 AND "date" = '2026-08-05';
  `, [empId]);
  console.log('Records:', JSON.stringify(resRecords.rows, null, 2));

  if (resRecords.rows.length > 0) {
    const recordId = resRecords.rows[0].id;
    console.log(`--- ATTENDANCE LOGS FOR RECORD ID ${recordId} ---`);
    const resLogs = await client.query(`
      SELECT * 
      FROM attendance_logs 
      WHERE "attendanceRecordId" = $1 OR ("employeeId" = $2 AND "timestamp"::date = '2026-08-05')
      ORDER BY "timestamp" ASC;
    `, [recordId, empId]);
    console.log('Logs:', JSON.stringify(resLogs.rows, null, 2));
  } else {
    console.log(`--- ATTENDANCE LOGS FOR EMPLOYEE ID ${empId} ON 2026-08-05 (NO RECORD) ---`);
    const resLogs = await client.query(`
      SELECT * 
      FROM attendance_logs 
      WHERE "employeeId" = $1 AND "timestamp"::date = '2026-08-05'
      ORDER BY "timestamp" ASC;
    `, [empId]);
    console.log('Logs:', JSON.stringify(resLogs.rows, null, 2));
  }

  await client.end();
}

run().catch(console.error);
