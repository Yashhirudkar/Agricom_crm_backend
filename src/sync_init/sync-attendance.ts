import { Shift } from '../attendance/models/shift.model';
import { AttendanceRecord } from '../attendance/models/attendance-record.model';
import { AttendanceLog } from '../attendance/models/attendance-log.model';
import { AttendanceException } from '../attendance/models/attendance-exception.model';

export const syncAttendance = async () => {
  console.log('--- Syncing Attendance Models ---');
  await Shift.sync({ alter: true });
  await AttendanceRecord.sync({ alter: true });
  await AttendanceLog.sync({ alter: true });
  await AttendanceException.sync({ alter: true });
  console.log('--- Attendance Models Synced successfully ---');
};
