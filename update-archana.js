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
  console.log('Starting direct DB update for Archana Sawalakhe (Employee ID 4) on 2026-08-05...');

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Delete any existing logs for the attendance record
    const deleteLogsRes = await client.query(`
      DELETE FROM attendance_logs 
      WHERE "attendanceRecordId" = 562 OR ("employeeId" = 4 AND "timestamp"::date = '2026-08-05');
    `);
    console.log(`Deleted ${deleteLogsRes.rowCount} old logs.`);

    // 2. Update the attendance record
    const updateRecordRes = await client.query(`
      UPDATE attendance_records
      SET 
        "checkInTime" = '2026-08-05 04:02:00+00',
        "checkOutTime" = '2026-08-05 12:25:00+00',
        "totalHours" = 7.88,
        "attendanceState" = 'CHECKED_OUT',
        "attendanceStatus" = 'PRESENT',
        "updatedAt" = NOW()
      WHERE id = 562;
    `);
    console.log(`Updated attendance record. Affected rows: ${updateRecordRes.rowCount}`);

    // 3. Insert new logs for CHECK_IN, BREAK_START, BREAK_END, CHECK_OUT
    const logs = [
      { actionType: 'CHECK_IN', timestamp: '2026-08-05 04:02:00+00' },
      { actionType: 'BREAK_START', timestamp: '2026-08-05 07:30:00+00' },
      { actionType: 'BREAK_END', timestamp: '2026-08-05 08:00:00+00' },
      { actionType: 'CHECK_OUT', timestamp: '2026-08-05 12:25:00+00' },
    ];

    for (const log of logs) {
      await client.query(`
        INSERT INTO attendance_logs ("employeeId", "attendanceRecordId", "actionType", "timestamp", "metadata")
        VALUES ($1, $2, $3, $4, $5);
      `, [4, 562, log.actionType, log.timestamp, JSON.stringify({ verificationMethod: 'WEB' })]);
      console.log(`Inserted log: ${log.actionType} at ${log.timestamp}`);
    }

    await client.query('COMMIT');
    console.log('Transaction committed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error occurred, transaction rolled back:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
