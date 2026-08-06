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
  console.log('--- FINDING YASH BORKAR ---');
  const resEmp = await client.query(`
    SELECT id, "firstName", "lastName", "employeeCode", "companyId"
    FROM employees 
    WHERE "firstName" ILIKE '%yash%' OR "lastName" ILIKE '%borkar%';
  `);
  console.log('Employees:', JSON.stringify(resEmp.rows, null, 2));

  if (resEmp.rows.length === 0) {
    console.log('No employee found with name Yash Borkar');
    await client.end();
    return;
  }

  const empId = resEmp.rows[0].id;

  console.log(`--- ATTENDANCE RECORDS FOR EMPLOYEE ID ${empId} ---`);
  const resRecords = await client.query(`
    SELECT id, date, "checkInTime", "checkOutTime", "totalHours", "attendanceState", "attendanceStatus"
    FROM attendance_records 
    WHERE "employeeId" = $1
    ORDER BY date DESC;
  `, [empId]);
  console.log('Records Count:', resRecords.rows.length);
  console.log('Records:', JSON.stringify(resRecords.rows, null, 2));

  const recordIds = resRecords.rows.map(r => r.id);
  if (recordIds.length > 0) {
    console.log(`--- ATTENDANCE LOGS COUNT FOR THESE RECORDS ---`);
    const resLogs = await client.query(`
      SELECT count(*) 
      FROM attendance_logs 
      WHERE "attendanceRecordId" = ANY($1) OR "employeeId" = $2;
    `, [recordIds, empId]);
    console.log('Logs Count:', resLogs.rows[0].count);
  }

  await client.end();
}

run().catch(console.error);
