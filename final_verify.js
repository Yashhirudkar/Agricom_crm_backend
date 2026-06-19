const { Client } = require('pg');
const axios = require('axios');

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

    // 1. Get an employee (abc@gmail.com)
    const empRes = await c.query(`SELECT u.id as user_id, u.email, e.id as emp_id, e."companyId" FROM users u JOIN employees e ON u.id = e."userId" WHERE u.email = 'abc@gmail.com'`);
    const targetEmp = empRes.rows[0];

    // Login as Super Admin
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@agricom.com',
      password: 'Admin@123'
    });
    const superAdminToken = loginRes.data.accessToken;
    const superAdminHeaders = {
      Authorization: `Bearer ${superAdminToken}`,
      'x-company-id': targetEmp.companyId.toString()
    };

    // Date for test
    const dateStr = '2026-06-20'; // use a fresh date
    
    // Clear existing for clean test
    await c.query('DELETE FROM attendance_exceptions WHERE "employeeId" = $1 AND "metadata"->>\'date\' = $2', [targetEmp.emp_id, dateStr]);
    await c.query('DELETE FROM attendance_records WHERE "employeeId" = $1 AND "date" = $2', [targetEmp.emp_id, dateStr]);

    // Create Exception via SQL (simulate employee action)
    const insertRes = await c.query(`
      INSERT INTO attendance_exceptions ("employeeId", "type", "status", "reason", "metadata", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [
      targetEmp.emp_id,
      'MISSED_PUNCH',
      'PENDING',
      'FINAL VERIFICATION TEST',
      JSON.stringify({
        date: dateStr,
        proposedCheckInTime: `${dateStr}T09:00:00Z`,
        proposedCheckOutTime: `${dateStr}T18:00:00Z`,
        reason: 'FINAL VERIFICATION TEST'
      })
    ]);
    const exceptionId = insertRes.rows[0].id;
    console.log("Exception Created:", exceptionId);

    // Approve using Super Admin
    console.log("Approving with Super Admin...");
    let appStatus = 0;
    try {
      const appRes = await axios.put(`http://localhost:5000/api/attendance/admin/approve-regularization/${exceptionId}`, {
        remarks: 'Approved by super admin test'
      }, { headers: superAdminHeaders });
      appStatus = appRes.status;
      console.log("Approval Status:", appStatus);
    } catch (err) {
      console.error("API ERROR:", err.response?.data || err.message);
      appStatus = err.response?.status || 500;
    }

    // Check Exceptions DB
    const exDbRes = await c.query('SELECT id, status FROM attendance_exceptions WHERE id = $1', [exceptionId]);
    console.log("Exception DB Status:", exDbRes.rows[0]?.status);

    // Check Records DB
    const recDbRes = await c.query('SELECT date, "checkInTime", "checkOutTime", "attendanceStatus" FROM attendance_records WHERE "employeeId" = $1 AND date = $2', [targetEmp.emp_id, dateStr]);
    console.log("Record DB Updated:", recDbRes.rows.length > 0 ? "YES" : "NO");
    if (recDbRes.rows.length > 0) {
      console.table(recDbRes.rows);
    }

    // Fetch Monthly Report
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Emp@123', 10);
    await c.query('UPDATE users SET password = $1 WHERE id = $2', [hash, targetEmp.user_id]);
    
    const empLoginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: targetEmp.email,
      password: 'Emp@123'
    });
    const empToken = empLoginRes.data.accessToken;
    const empHeaders = {
      Authorization: `Bearer ${empToken}`,
      'x-company-id': targetEmp.companyId.toString()
    };

    const month = parseInt(dateStr.split('-')[1]);
    const year = parseInt(dateStr.split('-')[0]);
    const repRes = await axios.get(`http://localhost:5000/api/attendance/report/monthly?month=${month}&year=${year}`, { headers: empHeaders });
    
    let isAbsent = true;
    for (const res of repRes.data) {
      if (res.employeeId === targetEmp.emp_id) {
        const day = res.days.find(d => d.date === dateStr);
        if (day) {
          console.log(`Report Status for ${dateStr}:`, day.attendanceStatus);
          if (day.attendanceStatus !== 'ABSENT') {
            isAbsent = false;
          }
        }
      }
    }

    console.log("\n--- FINAL OUTPUT ---");
    console.log(`1 approve API status code: ${appStatus}`);
    console.log(`2 exception table status: ${exDbRes.rows[0]?.status}`);
    console.log(`3 attendance_records updated yes/no: ${recDbRes.rows.length > 0 ? 'YES' : 'NO'}`);
    console.log(`4 monthly report status: ${isAbsent ? 'ABSENT' : 'NOT ABSENT'}`);
    console.log(`5 final bug status fixed/not fixed: ${(!isAbsent && appStatus === 200) ? 'FIXED' : 'NOT FIXED'}`);

  } catch (err) {
    console.error("FATAL ERROR:", err);
  } finally {
    await c.end();
  }
}

run();
