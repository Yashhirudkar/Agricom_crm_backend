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
  console.log('Starting DB setup for Yash Borkar (Employee ID 65) on 2026-08-05...');

  try {
    // Get companyId for Yash Borkar
    const empRes = await client.query('SELECT "companyId" FROM employees WHERE id = 65;');
    if (empRes.rows.length === 0) {
      console.error('Employee ID 65 not found!');
      await client.end();
      return;
    }
    const companyId = empRes.rows[0].companyId;
    console.log(`Found Company ID: ${companyId} for Yash Borkar.`);

    // Start transaction
    await client.query('BEGIN');

    // 1. Delete any existing record or logs for this date just in case
    await client.query(`
      DELETE FROM attendance_logs 
      WHERE "employeeId" = 65 AND "timestamp"::date = '2026-08-05';
    `);
    await client.query(`
      DELETE FROM attendance_records 
      WHERE "employeeId" = 65 AND "date" = '2026-08-05';
    `);

    // 2. Insert new attendance record
    const insertRecordRes = await client.query(`
      INSERT INTO attendance_records (
        "employeeId", "companyId", "date", "checkInTime", "checkOutTime", 
        "totalHours", "overtimeHours", "lateMinutes", "attendanceState", 
        "attendanceStatus", "attendanceSource", "isPayrollLocked", "isConflict", "isIgnored",
        "createdAt", "updatedAt"
      ) VALUES (
        65, $1, '2026-08-05', '2026-08-05 04:02:00+00', '2026-08-05 12:25:00+00', 
        7.88, 0.00, 2, 'CHECKED_OUT', 
        'PRESENT', 'SELF_PUNCH', false, false, false,
        NOW(), NOW()
      ) RETURNING id;
    `, [companyId]);

    const recordId = insertRecordRes.rows[0].id;
    console.log(`Inserted attendance record with ID: ${recordId}`);

    // 3. Insert logs for CHECK_IN, BREAK_START, BREAK_END, CHECK_OUT
    const logs = [
      { actionType: 'CHECK_IN', timestamp: '2026-08-05 04:02:00+00' },
      { actionType: 'BREAK_START', timestamp: '2026-08-05 07:30:00+00' },
      { actionType: 'BREAK_END', timestamp: '2026-08-05 08:00:00+00' },
      { actionType: 'CHECK_OUT', timestamp: '2026-08-05 12:25:00+00' },
    ];

    for (const log of logs) {
      await client.query(`
        INSERT INTO attendance_logs ("employeeId", "attendanceRecordId", "actionType", "timestamp", "metadata")
        VALUES (65, $1, $2, $3, $4);
      `, [recordId, log.actionType, log.timestamp, JSON.stringify({ verificationMethod: 'WEB' })]);
      console.log(`Inserted log: ${log.actionType} at ${log.timestamp}`);
    }

    await client.query('COMMIT');
    console.log('Yash Borkar attendance record and logs successfully created!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error occurred, transaction rolled back:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
