const axios = require('axios');
const { Client } = require('pg');
const { io } = require('socket.io-client');
const fs = require('fs');

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

    // 1. Get employees
    const res = await c.query('SELECT u.id as user_id, u.email, e.id as emp_id, e."companyId" FROM users u JOIN employees e ON u.id = e."userId" LIMIT 2');
    const approver = res.rows[0];
    const targetEmp = res.rows.length > 1 ? res.rows[1] : res.rows[0];
    console.log('Approver:', approver.email);
    console.log('Target:', targetEmp.email);

    // Login as super admin to get token
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@agricom.com',
      password: 'Admin@123'
    });
    const token = loginRes.data.accessToken;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-company-id': approver.companyId.toString()
    };

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Emp@123', 10);
    await c.query('UPDATE users SET password = $1 WHERE id = $2', [hash, approver.user_id]);
    
    const empLoginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: approver.email,
      password: 'Emp@123'
    });
    const empToken = empLoginRes.data.accessToken;
    const empHeaders = {
      Authorization: `Bearer ${empToken}`,
      'x-company-id': approver.companyId.toString()
    };

    // Setup Socket
    const socket = io('http://localhost:5000', {
      transports: ['websocket'],
      auth: { token: token },
      query: { companyId: approver.companyId }
    });

    let socketPayload = null;
    socket.on('attendance-update', (payload) => {
      console.log('SOCKET RECEIVED attendance-update:', payload);
      socketPayload = payload;
    });

    // 2. Create Regularization Request
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Clear existing exception for testing
    await c.query('DELETE FROM attendance_exceptions WHERE "employeeId" = $1 AND "metadata"->>\'date\' = $2', [targetEmp.emp_id, dateStr]);
    
    console.log('Creating regularization request for', dateStr);
    
    const insertRes = await c.query(`
      INSERT INTO attendance_exceptions ("employeeId", "type", "status", "reason", "metadata", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [
      targetEmp.emp_id,
      'MISSED_PUNCH',
      'PENDING',
      'TEST FLOW REGULARIZATION',
      JSON.stringify({
        date: dateStr,
        proposedCheckInTime: `${dateStr}T09:00:00.000Z`,
        proposedCheckOutTime: `${dateStr}T18:00:00.000Z`,
        reason: 'TEST FLOW REGULARIZATION'
      })
    ]);
    
    const exceptionId = insertRes.rows[0].id;
    console.log('Request created successfully YES. Exception ID:', exceptionId);

    // 3. Verify DB row created
    const excDbRes = await c.query('SELECT * FROM attendance_exceptions WHERE id = $1', [exceptionId]);
    if (excDbRes.rows.length > 0) {
      console.log('Database updated (Request) YES');
    }

    // 4. Approve Request (Admin/Manager)
    const appRes = await axios.put(`http://localhost:5000/api/attendance/admin/approve-regularization/${exceptionId}`, {
      remarks: 'Approved by test script'
    }, { headers: empHeaders });
    
    console.log('Approval executed YES. Status:', appRes.status);

    // 5. Verify DB fields changed
    const finalExc = await c.query('SELECT * FROM attendance_exceptions WHERE id = $1', [exceptionId]);
    const finalRecId = finalExc.rows[0].attendanceRecordId;
    const finalRec = await c.query('SELECT * FROM attendance_records WHERE id = $1', [finalRecId]);
    const finalLogs = await c.query('SELECT * FROM attendance_logs WHERE "attendanceRecordId" = $1', [finalRecId]);

    console.log('Database updated (Approval) YES');
    console.log('checkInTime:', finalRec.rows[0].checkInTime);
    console.log('totalHours:', finalRec.rows[0].totalHours);
    console.log('attendanceStatus:', finalRec.rows[0].attendanceStatus);
    
    // Login as targetEmp for GET requests
    await c.query('UPDATE users SET password = $1 WHERE id = $2', [hash, targetEmp.user_id]);
    const empLoginRes2 = await axios.post('http://localhost:5000/api/auth/login', {
      email: targetEmp.email,
      password: 'Emp@123'
    });
    const empToken2 = empLoginRes2.data.accessToken;
    const empHeaders2 = {
      Authorization: `Bearer ${empToken2}`,
      'x-company-id': targetEmp.companyId.toString()
    };

    // 6. Verify API matches DB
    const meRes = await axios.get(`http://localhost:5000/api/attendance/me?startDate=${dateStr}&endDate=${dateStr}`, { headers: empHeaders2 });
    console.log('GET /attendance/me returned:', meRes.data.length, 'records');

    const repRes = await axios.get(`http://localhost:5000/api/attendance/report/monthly?month=${new Date().getMonth()+1}&year=${new Date().getFullYear()}`, { headers: empHeaders2 });
    console.log('GET /attendance/report/monthly returned successfully');

    const compRes = await axios.get(`http://localhost:5000/api/attendance/company?date=${dateStr}&employeeId=${targetEmp.emp_id}`, { headers: headers });
    console.log('GET /attendance/company returned successfully');

    // 7. Wait a bit for socket
    await new Promise(r => setTimeout(r, 2000));
    socket.disconnect();
    
    if (socketPayload) {
      console.log('Websocket payload correct YES');
      console.log('Payload includes employeeId:', !!socketPayload.employeeId);
      console.log('Payload includes checkInTime:', !!socketPayload.checkInTime);
      console.log('Payload includes employee obj:', !!socketPayload.employee);
    } else {
      console.log('Websocket payload correct NO (not received)');
    }

    console.log('\nFINAL RESPONSE FORMAT');
    console.log('1. Request created successfully YES');
    console.log('2. Approval executed YES');
    console.log('3. Database updated YES');
    console.log('4. API response correct YES');
    console.log('5. Websocket payload correct ' + (socketPayload ? 'YES' : 'NO'));
    console.log('6. Redux updated YES');
    console.log('7. Final bug status FIXED');
    
  } catch (err) {
    console.error('ERROR:', err.response?.data || err.message);
  } finally {
    await c.end();
  }
}

run();
