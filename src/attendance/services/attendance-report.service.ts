import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceStatus, AttendanceState } from '../models/attendance-record.model';
import { AttendanceLog } from '../models/attendance-log.model';
import { Shift } from '../models/shift.model';
import { Employee } from '../../hrms/models/employee.model';
import { LeaveRequest, LeaveRequestStatus } from '../../hrms/models/leave-request.model';
import { Branch } from '../../hrms/models/branch.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Op } from 'sequelize';
import { AttendanceHelperService } from './attendance-helper.service';

@Injectable()
export class AttendanceReportService {
  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    private readonly helperService: AttendanceHelperService,
  ) {}

  // 8. Get Own Attendance (Self)
  async getMyAttendance(employeeId: number, companyId: number, filters: { startDate?: string, endDate?: string }): Promise<any> {
    const whereClause: any = { employeeId, companyId };

    if (filters.startDate || filters.endDate) {
      whereClause.date = {};
      if (filters.startDate) {
        whereClause.date[Op.gte] = filters.startDate;
      }
      if (filters.endDate) {
        whereClause.date[Op.lte] = filters.endDate;
      }
    }

    if (filters.startDate || filters.endDate) {
      const activeLeaves = await this.leaveRequestModel.findAll({
        where: {
          employeeId,
          companyId,
          status: LeaveRequestStatus.APPROVED,
          [Op.or]: [
            {
              fromDate: {
                [Op.between]: [filters.startDate || '1970-01-01', filters.endDate || '9999-12-31']
              }
            },
            {
              toDate: {
                [Op.between]: [filters.startDate || '1970-01-01', filters.endDate || '9999-12-31']
              }
            },
            {
              fromDate: { [Op.lte]: filters.startDate || '1970-01-01' },
              toDate: { [Op.gte]: filters.endDate || '9999-12-31' }
            }
          ]
        }
      });

      if (activeLeaves.length > 0) {
        const t = await this.recordModel.sequelize!.transaction();
        try {
          for (const leave of activeLeaves) {
            const leaveFromTime = new Date(leave.fromDate).getTime();
            const filterStartTime = new Date(filters.startDate || '1970-01-01').getTime();
            const start = new Date(leaveFromTime > filterStartTime ? leave.fromDate : (filters.startDate || '1970-01-01'));

            const leaveToTime = new Date(leave.toDate).getTime();
            const filterEndTime = new Date(filters.endDate || '9999-12-31').getTime();
            const end = new Date(leaveToTime < filterEndTime ? leave.toDate : (filters.endDate || '9999-12-31'));
            const curr = new Date(start);
            while (curr <= end) {
              const dStr = curr.toLocaleDateString('en-CA', { timeZone: 'UTC' });
              const record = await this.recordModel.findOne({
                where: { employeeId, date: dStr },
                lock: t.LOCK.UPDATE,
                transaction: t,
              });
              if (!record) {
                await this.recordModel.create({
                  employeeId,
                  companyId,
                  date: dStr,
                  attendanceStatus: AttendanceStatus.ON_LEAVE,
                  totalHours: 0,
                  overtimeHours: 0,
                  lateMinutes: 0,
                  shiftId: null,
                } as any, { transaction: t });
              }
              curr.setDate(curr.getDate() + 1);
            }
          }
          await t.commit();
        } catch (err) {
          await t.rollback();
        }
      }
    }

    const records = await this.recordModel.findAll({
      where: whereClause,
      include: [
        Shift,
        {
          model: AttendanceLog,
          as: 'logs',
          required: false,
        }
      ],
      order: [['date', 'DESC']],
    });

    return records;
  }

  // 9. Get Company Attendance
  async getCompanyAttendance(companyId: number, filters: { date?: string, employeeId?: number }): Promise<AttendanceRecord[]> {
    const whereClause: any = { companyId };

    if (filters.date) {
      whereClause.date = filters.date;
    }
    if (filters.employeeId) {
      whereClause.employeeId = filters.employeeId;
    }

    if (filters.date) {
      const activeLeaves = await this.leaveRequestModel.findAll({
        where: {
          companyId,
          status: LeaveRequestStatus.APPROVED,
          fromDate: { [Op.lte]: filters.date },
          toDate: { [Op.gte]: filters.date },
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {})
        }
      });

      if (activeLeaves.length > 0) {
        const t = await this.recordModel.sequelize!.transaction();
        try {
          for (const leave of activeLeaves) {
            const record = await this.recordModel.findOne({
              where: { employeeId: leave.employeeId, date: filters.date },
              lock: t.LOCK.UPDATE,
              transaction: t,
            });

            if (!record) {
              await this.recordModel.create({
                employeeId: leave.employeeId,
                companyId,
                date: filters.date,
                attendanceStatus: AttendanceStatus.ON_LEAVE,
                totalHours: 0,
                overtimeHours: 0,
                lateMinutes: 0,
                shiftId: null,
              } as any, { transaction: t });
            }
          }
          await t.commit();
        } catch (err) {
          await t.rollback();
        }
      }
    }

    return this.recordModel.findAll({
      where: whereClause,
      include: [Employee, Shift],
      order: [['date', 'DESC'], ['employeeId', 'ASC']],
    });
  }

  // 10. Monthly Attendance Report
  async getMonthlyReport(companyId: number, query: { month: number; year: number; employeeId?: number }): Promise<any> {
    const startStr = `${query.year}-${String(query.month).padStart(2, '0')}-01`;
    const lastDay = new Date(query.year, query.month, 0).getDate();
    const endStr = `${query.year}-${String(query.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get all employees first
    const employeeWhere: any = { companyId };
    if (query.employeeId) {
      employeeWhere.id = query.employeeId;
    }
    const employees = await this.employeeModel.findAll({
      where: employeeWhere,
      include: [Branch],
    });

    // Get all holidays for the month
    const holidays = await this.holidayModel.findAll({
      where: {
        holidayDate: {
          [Op.between]: [startStr, endStr],
        },
        isActive: true,
      },
      include: [{
        model: HolidayCompany,
        where: { companyId },
        required: true,
      }],
    });
    const holidayDates = new Set(holidays.map(h => h.holidayDate.toString()));

    // Fetch all approved leave requests for this month
    const leaves = await this.leaveRequestModel.findAll({
      where: {
        employeeId: employees.map(e => e.id),
        status: LeaveRequestStatus.APPROVED,
        [Op.or]: [
          {
            fromDate: { [Op.between]: [startStr, endStr] }
          },
          {
            toDate: { [Op.between]: [startStr, endStr] }
          },
          {
            fromDate: { [Op.lte]: startStr },
            toDate: { [Op.gte]: endStr }
          }
        ]
      }
    });

    const employeeLeavesMap = new Map<number, Set<string>>();
    for (const leave of leaves) {
      if (!employeeLeavesMap.has(leave.employeeId)) {
        employeeLeavesMap.set(leave.employeeId, new Set<string>());
      }
      const leaveSet = employeeLeavesMap.get(leave.employeeId)!;
      const leaveFromTime = new Date(leave.fromDate).getTime();
      const monthStartTime = new Date(startStr).getTime();
      const start = new Date(leaveFromTime > monthStartTime ? leave.fromDate : startStr);

      const leaveToTime = new Date(leave.toDate).getTime();
      const monthEndTime = new Date(endStr).getTime();
      const end = new Date(leaveToTime < monthEndTime ? leave.toDate : endStr);
      const curr = new Date(start);
      while (curr <= end) {
        leaveSet.add(curr.toLocaleDateString('en-CA', { timeZone: 'UTC' }));
        curr.setDate(curr.getDate() + 1);
      }
    }

    // Fetch policy once to avoid N+1 queries
    const policy = await this.policyModel.findOne({ where: { companyId } });
    const defaultWeeklyOffDays = policy?.weeklyOffDays || [0, 6];

    // Fetch all shifts once to avoid N+1 queries
    const shifts = await this.shiftModel.findAll({ where: { companyId } });
    const shiftMap = new Map<number, Shift>();
    for (const sh of shifts) {
      shiftMap.set(sh.id, sh);
    }

    // Fetch all attendance records for the month once to avoid N+1 queries
    const allRecords = await this.recordModel.findAll({
      where: {
        companyId,
        date: {
          [Op.between]: [startStr, endStr],
        },
        ...(query.employeeId ? { employeeId: query.employeeId } : {})
      },
    });

    const employeeRecordsMap = new Map<number, AttendanceRecord[]>();
    for (const rec of allRecords) {
      if (!employeeRecordsMap.has(rec.employeeId)) {
        employeeRecordsMap.set(rec.employeeId, []);
      }
      employeeRecordsMap.get(rec.employeeId)!.push(rec);
    }

    const result = [];

    for (const employee of employees) {
      const timezone = employee.branch?.timezone || 'Asia/Kolkata';
      const { todayDateStr, minutesOfDay } = this.helperService.getLocalTimeDetails(timezone);

      const records = employeeRecordsMap.get(employee.id) || [];
      const recordMap = new Map<string, AttendanceRecord>();
      for (const rec of records) {
        console.log("MONTHLY REPORT DB RECORD DATE:", rec.date, typeof rec.date, rec.id);
        recordMap.set(rec.date, rec);
      }

      // Resolve Shift/Policy using maps/caches
      let shift: any = null;
      if (employee.shiftId) {
        shift = shiftMap.get(employee.shiftId) || null;
      }
      if (!shift) {
        shift = {
          weeklyOffDays: defaultWeeklyOffDays,
        };
      }

      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let halfDayCount = 0;
      let weeklyOffCount = 0;
      let holidayCount = 0;
      let leaveCount = 0;
      let totalWorkHours = 0;
      let totalOvertimeHours = 0;
      let totalLateMinutes = 0;
      const daysDetails = [];

      // Loop through every single day of the month
      for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${query.year}-${String(query.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Find JS day of week (0-6)
        const dateObj = new Date(`${dateStr}T12:00:00`); // Use midday to avoid TZ shifts
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
        const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const jsDay = weekdayNames.indexOf(dayOfWeekStr);

        const isWeeklyOff = shift.weeklyOffDays.includes(jsDay);
        const isHoliday = holidayDates.has(dateStr);

        const record = recordMap.get(dateStr);
        const leaveSet = employeeLeavesMap.get(employee.id);
        const isOnLeave = (leaveSet && leaveSet.has(dateStr)) || (record && record.attendanceStatus === AttendanceStatus.ON_LEAVE);

        let status: AttendanceStatus = null;
        let workHours = 0;
        let overtime = 0;
        let lateMinutes = 0;
        let checkIn = null;
        let checkOut = null;
        let attendanceState = record ? record.attendanceState : AttendanceState.NOT_CHECKED_IN;

        if (record) {
          status = record.attendanceStatus;
          workHours = record.attendanceState === AttendanceState.WORKING ? 0 : Number(record.totalHours || 0);
          overtime = Number(record.overtimeHours || 0);
          lateMinutes = Number(record.lateMinutes || 0);
          checkIn = record.checkInTime;
          checkOut = record.checkOutTime;
        }

        // Apply enterprise status resolution rules:
        if (dateStr > todayDateStr) {
          // Future dates:
          if (isOnLeave) {
            status = AttendanceStatus.ON_LEAVE;
          } else if (isHoliday) {
            status = AttendanceStatus.HOLIDAY;
          } else if (isWeeklyOff) {
            status = AttendanceStatus.WEEK_OFF;
          } else {
            status = AttendanceStatus.UPCOMING; // Never ABSENT for future dates
          }
        } else if (dateStr === todayDateStr) {
          // Today:
          if (status && status !== AttendanceStatus.ABSENT && status !== AttendanceStatus.UPCOMING) {
            // Keep actual punch status (e.g. PRESENT, LATE, HALF_DAY)
          } else if (attendanceState === AttendanceState.WORKING || checkIn) {
            // Active check-in. Do not overwrite with ABSENT.
            status = null as any;
          } else if (isOnLeave) {
            status = AttendanceStatus.ON_LEAVE;
          } else if (isHoliday) {
            status = AttendanceStatus.HOLIDAY;
          } else if (isWeeklyOff) {
            status = AttendanceStatus.WEEK_OFF;
          } else {
            // Today working day: check if shift start time crossed
            const [shStartHour, shStartMin] = (shift.startTime || '09:00').split(':').map(Number);
            const shiftStartMinutes = shStartHour * 60 + shStartMin;
            
            if (minutesOfDay < shiftStartMinutes) {
              status = AttendanceStatus.UPCOMING;
            } else {
              // Shift started, employee missed check-in
              status = AttendanceStatus.ABSENT; // Or check policy: since no punch, they are absent for now
            }
          }
        } else {
          // Past dates:
          if (status && status !== AttendanceStatus.ABSENT && status !== AttendanceStatus.UPCOMING) {
            // Keep actual punch status
          } else if (attendanceState === AttendanceState.WORKING || checkIn) {
            // They forgot to check out! Leave as null or let policy decide later
            status = null as any;
          } else if (isOnLeave) {
            status = AttendanceStatus.ON_LEAVE;
          } else if (isHoliday) {
            status = AttendanceStatus.HOLIDAY;
          } else if (isWeeklyOff) {
            status = AttendanceStatus.WEEK_OFF;
          } else {
            status = AttendanceStatus.ABSENT;
          }
        }

        // Increment counts based on resolved status:
        if (status === AttendanceStatus.PRESENT) presentCount++;
        else if (status === AttendanceStatus.ABSENT) absentCount++;
        else if (status === AttendanceStatus.LATE) lateCount++;
        else if (status === AttendanceStatus.HALF_DAY) halfDayCount++;
        else if (status === AttendanceStatus.WEEK_OFF) weeklyOffCount++;
        else if (status === AttendanceStatus.ON_LEAVE) leaveCount++;
        else if (status === AttendanceStatus.HOLIDAY) holidayCount++;

        totalWorkHours += workHours;
        totalOvertimeHours += overtime;
        totalLateMinutes += lateMinutes;

        daysDetails.push({
          date: dateStr,
          checkIn,
          checkOut,
          status,
          workHours,
          overtime,
          lateMinutes,
          attendanceState,
        });
      }

      const totalWorkingDays = lastDay - weeklyOffCount - holidayCount;
      const actualPresent = presentCount + lateCount + halfDayCount * 0.5;
      const attendancePercentage = totalWorkingDays > 0 
        ? parseFloat(((actualPresent / totalWorkingDays) * 100).toFixed(2))
        : 0;

      result.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        summary: {
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          halfDay: halfDayCount,
          weeklyOff: weeklyOffCount,
          holiday: holidayCount,
          leave: leaveCount,
          totalWorkHours: parseFloat(totalWorkHours.toFixed(2)),
          totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
          totalLateMinutes,
          attendancePercentage,
          presentPercentage: parseFloat(((presentCount / lastDay) * 100).toFixed(2)),
          absentPercentage: parseFloat(((absentCount / lastDay) * 100).toFixed(2)),
          latePercentage: parseFloat(((lateCount / lastDay) * 100).toFixed(2)),
          halfDayPercentage: parseFloat(((halfDayCount / lastDay) * 100).toFixed(2)),
          weeklyOffPercentage: parseFloat(((weeklyOffCount / lastDay) * 100).toFixed(2)),
          holidayPercentage: parseFloat(((holidayCount / lastDay) * 100).toFixed(2)),
          leavePercentage: parseFloat(((leaveCount / lastDay) * 100).toFixed(2)),
        },
        days: daysDetails,
      });
    }

    // Temporary logs for Phase 1 backend trace
    for (const res of result) {
      const todayRecord = res.days.find(d => d.date === '2026-06-17');
      if (todayRecord) {
        console.log("BACKEND TEMP LOG getMonthlyReport today's record:", {
          employeeId: res.employeeId,
          date: todayRecord.date,
          checkIn: todayRecord.checkIn,
          checkOut: todayRecord.checkOut,
          attendanceState: todayRecord.attendanceState,
          attendanceStatus: todayRecord.status
        });
      }
    }

    return result;
  }
}
