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
    const requestDateStr = '2026-06-17';

    let record = await AttendanceRecord.findOne({
      where: { employeeId, date: requestDateStr }
    });

    console.log("Did findOne find '2026-06-17'?", !!record);
    if (record) {
      console.log("Record ID:", record.id);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
