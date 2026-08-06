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
  console.log('Searching for Yash Borkar to reset attendance...');

  try {
    const resEmp = await client.query(`
      SELECT id, "firstName", "lastName" 
      FROM employees 
      WHERE "firstName" ILIKE '%yash%' OR "lastName" ILIKE '%borkar%';
    `);

    if (resEmp.rows.length === 0) {
      console.log('No employee found with name Yash Borkar.');
      await client.end();
      return;
    }

    const employee = resEmp.rows[0];
    const empId = employee.id;
    console.log(`Found Employee: ${employee.firstName} ${employee.lastName} (ID: ${empId})`);

    // Start transaction
    await client.query('BEGIN');

    // 1. Delete logs first due to foreign key constraints
    const deleteLogsRes = await client.query(`
      DELETE FROM attendance_logs 
      WHERE "employeeId" = $1;
    `, [empId]);
    console.log(`Deleted ${deleteLogsRes.rowCount} attendance logs.`);

    // 2. Delete records
    const deleteRecordsRes = await client.query(`
      DELETE FROM attendance_records 
      WHERE "employeeId" = $1;
    `, [empId]);
    console.log(`Deleted ${deleteRecordsRes.rowCount} attendance records.`);

    await client.query('COMMIT');
    console.log(`Successfully reset attendance for ${employee.firstName} ${employee.lastName}!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error occurred, transaction rolled back:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
