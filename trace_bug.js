const { Sequelize, DataTypes, Op } = require('sequelize');

async function run() {
  const sequelize = new Sequelize('postgres://postgres:admin@localhost:5432/Agricom_db', {
    logging: false
  });

  const AttendanceRecord = sequelize.define('attendance_records', {
    employeeId: DataTypes.INTEGER,
    companyId: DataTypes.INTEGER,
    date: DataTypes.DATEONLY,
    checkInTime: DataTypes.DATE,
    checkOutTime: DataTypes.DATE,
    attendanceStatus: DataTypes.STRING,
    attendanceState: DataTypes.STRING,
    totalHours: DataTypes.DECIMAL,
    overtimeHours: DataTypes.DECIMAL
  });

  try {
    const employeeId = 24;
    const companyId = 1;
    const requestDateStr = '2026-06-17';

    // Delete existing
    await AttendanceRecord.destroy({ where: { employeeId, date: requestDateStr } });

    // 1. Simulate approveCorrection
    console.log("Simulating approveCorrection creating record for", requestDateStr);
    const newRecord = await AttendanceRecord.create({
      employeeId,
      companyId,
      date: requestDateStr,
      checkInTime: new Date(`${requestDateStr}T09:00:00Z`),
      checkOutTime: new Date(`${requestDateStr}T18:00:00Z`),
      attendanceStatus: 'PRESENT',
      attendanceState: 'CHECKED_OUT',
      totalHours: 8.00
    });
    console.log("RAW DB RECORD CREATED:", newRecord.toJSON());

    // 2. Simulate getMonthlyReport
    const startStr = `2026-06-01`;
    const endStr = `2026-06-30`;

    const allRecords = await AttendanceRecord.findAll({
      where: {
        companyId,
        date: {
          [Op.between]: [startStr, endStr],
        },
        employeeId
      },
    });

    console.log("getMonthlyReport DB query results count:", allRecords.length);
    
    const recordMap = new Map();
    for (const rec of allRecords) {
      console.log("FETCHED RECORD DATE:", rec.date, typeof rec.date);
      recordMap.set(rec.date, rec);
    }

    const matchedRecord = recordMap.get(requestDateStr);
    console.log("DID IT MATCH '2026-06-17'?", !!matchedRecord);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
