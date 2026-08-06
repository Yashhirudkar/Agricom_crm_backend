import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceState,
} from '../models/attendance-record.model';
import { AttendanceLog } from '../models/attendance-log.model';
import { LeaveRequest, LeaveRequestStatus } from '../../hrms/models/leave-request.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Shift } from '../models/shift.model';
import { Employee } from '../../hrms/models/employee.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Branch } from '../../hrms/models/branch.model';
import { AttendanceHelperService } from './attendance-helper.service';
import { Op } from 'sequelize';

export interface AttendanceDayDto {
  date: string;
  status: string | null;
  isLate: boolean;
  lateMinutes: number;
  workHours: number;
  overtime: number;
  attendanceState: string;
  checkIn: Date | string | null;
  checkOut: Date | string | null;
  logs?: any[];
  shift?: any;
}

export interface AttendanceSummaryDto {
  present: number;
  absent: number;
  halfDay: number;
  late: number;
  leave: number;
  holiday: number;
  weeklyOff: number;
  totalWorkHours: number;
  totalOvertimeHours: number;
  totalLateMinutes: number;
  attendancePercentage: number;
}

@Injectable()
export class AttendanceSummaryService {
  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    private readonly helperService: AttendanceHelperService,
  ) {}

  public normalizeLegacyStatus(status: string | null): string | null {
    if (status === 'LATE') {
      return 'PRESENT';
    }
    return status;
  }

  public normalizeAttendanceRecord(record: any): AttendanceDayDto {
    const status = record?.attendanceStatus || null;
    const lateMinutes = Number(record?.lateMinutes || 0);
    const workHours =
      record?.attendanceState === AttendanceState.WORKING
        ? 0
        : Number(record?.totalHours || 0);
    const overtime = Number(record?.overtimeHours || 0);

    return {
      date: record.date,
      status: this.normalizeLegacyStatus(status),
      isLate: lateMinutes > 0 || status === 'LATE',
      lateMinutes,
      workHours: parseFloat(workHours.toFixed(2)),
      overtime: parseFloat(overtime.toFixed(2)),
      attendanceState: record.attendanceState || AttendanceState.NOT_CHECKED_IN,
      checkIn: record.checkInTime || null,
      checkOut: record.checkOutTime || null,
      logs: record.logs || [],
      shift: record.shift || null,
    };
  }

  public buildSummary(days: AttendanceDayDto[]): AttendanceSummaryDto {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let late = 0;
    let leave = 0;
    let holiday = 0;
    let weeklyOff = 0;
    let totalWorkHours = 0;
    let totalOvertimeHours = 0;
    let totalLateMinutes = 0;

    for (const d of days) {
      if (d.status === 'PRESENT') {
        present++;
      } else if (d.status === 'ABSENT') {
        absent++;
      } else if (d.status === 'HALF_DAY') {
        halfDay++;
      } else if (d.status === 'ON_LEAVE') {
        leave++;
      } else if (d.status === 'WEEK_OFF') {
        weeklyOff++;
      } else if (d.status === 'HOLIDAY') {
        holiday++;
      }

      if (d.isLate && d.status !== 'PRESENT') {
        late++;
      }

      totalWorkHours += d.workHours;
      totalOvertimeHours += d.overtime;
      totalLateMinutes += d.lateMinutes;
    }

    const totalDays = days.length;
    const workingDays = totalDays - weeklyOff - holiday;
    const attendanceCount = present + halfDay * 0.5;
    const attendancePercentage =
      workingDays > 0 ? parseFloat(((attendanceCount / workingDays) * 100).toFixed(2)) : 0;

    return {
      present,
      absent,
      halfDay,
      late,
      leave,
      holiday,
      weeklyOff,
      totalWorkHours: parseFloat(totalWorkHours.toFixed(2)),
      totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
      totalLateMinutes,
      attendancePercentage,
    };
  }

  public buildCompanyDailySummary(records: AttendanceRecord[]): any {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let late = 0;
    let onLeave = 0;
    const total = records.length;

    for (const r of records) {
      const normalizedStatus = this.normalizeLegacyStatus(r.attendanceStatus);
      const isLate = r.lateMinutes > 0 || r.attendanceStatus === 'LATE';

      if (normalizedStatus === 'PRESENT') {
        present++;
      } else if (normalizedStatus === 'ABSENT') {
        absent++;
      } else if (normalizedStatus === 'HALF_DAY') {
        halfDay++;
      } else if (normalizedStatus === 'ON_LEAVE') {
        onLeave++;
      }

      if (isLate) {
        late++;
      }
    }

    return {
      total,
      present,
      absent,
      late,
      halfDay,
      onLeave,
    };
  }

  async getEmployeeMonthlySummary(
    companyId: number,
    employeeId: number,
    year: number,
    month: number,
  ): Promise<{ summary: AttendanceSummaryDto; days: AttendanceDayDto[] }> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
      include: [Branch],
    });

    if (!employee) {
      return {
        summary: {
          present: 0,
          absent: 0,
          halfDay: 0,
          late: 0,
          leave: 0,
          holiday: 0,
          weeklyOff: 0,
          totalWorkHours: 0,
          totalOvertimeHours: 0,
          totalLateMinutes: 0,
          attendancePercentage: 0,
        },
        days: [],
      };
    }

    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr, minutesOfDay } = this.helperService.getLocalTimeDetails(timezone);

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get holidays
    const holidays = await this.holidayModel.findAll({
      where: {
        holidayDate: { [Op.between]: [startStr, endStr] },
        isActive: true,
      },
      include: [{ model: HolidayCompany, where: { companyId }, required: true }],
    });
    const holidayDates = new Set(holidays.map((h) => h.holidayDate.toString()));

    // Get leaves
    const leaves = await this.leaveRequestModel.findAll({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        [Op.or]: [
          { fromDate: { [Op.between]: [startStr, endStr] } },
          { toDate: { [Op.between]: [startStr, endStr] } },
          { fromDate: { [Op.lte]: startStr }, toDate: { [Op.gte]: endStr } },
        ],
      },
    });

    const leaveMap = new Map<string, LeaveRequest>();
    for (const leave of leaves) {
      const start = new Date(
        new Date(leave.fromDate).getTime() > new Date(startStr).getTime() ? leave.fromDate : startStr,
      );
      const end = new Date(
        new Date(leave.toDate).getTime() < new Date(endStr).getTime() ? leave.toDate : endStr,
      );
      const curr = new Date(start);
      while (curr <= end) {
        leaveMap.set(curr.toLocaleDateString('en-CA', { timeZone: 'UTC' }), leave);
        curr.setDate(curr.getDate() + 1);
      }
    }

    // Get HR Policy & shifts
    const policy = await this.policyModel.findOne({ where: { companyId } });
    const defaultWeeklyOffDays = policy?.weeklyOffDays || [0, 6];

    let shift: any = null;
    if (employee.shiftId) {
      shift = await this.shiftModel.findByPk(employee.shiftId);
    }
    if (!shift) {
      shift = { weeklyOffDays: defaultWeeklyOffDays, startTime: policy?.defaultShiftStartTime || '00:00' };
    }

    // Get database attendance records
    const records = await this.recordModel.findAll({
      where: {
        companyId,
        employeeId,
        date: { [Op.between]: [startStr, endStr] },
      },
      include: [
        Shift,
        {
          model: AttendanceLog,
          as: 'logs',
          required: false,
        },
      ],
    });
    const recordMap = new Map<string, AttendanceRecord>();
    for (const rec of records) {
      recordMap.set(rec.date, rec);
    }

    const daysDetails: AttendanceDayDto[] = [];

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Calculate JS day of week (0-6)
      const dateObj = new Date(`${dateStr}T12:00:00`);
      const dayOfWeekStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: timezone,
      });
      const weekdayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const jsDay = weekdayNames.indexOf(dayOfWeekStr);

      const isWeeklyOff = shift.weeklyOffDays.includes(jsDay);
      const isHoliday = holidayDates.has(dateStr);

      const record = recordMap.get(dateStr);
      const matchedLeave = leaveMap.get(dateStr);
      const isOnLeave = !!matchedLeave || (record && record.attendanceStatus === AttendanceStatus.ON_LEAVE);

      let status: AttendanceStatus = null;
      let workHours = 0;
      let overtime = 0;
      let lateMinutes = 0;
      let checkIn = null;
      let checkOut = null;
      let logs = [];
      let shiftDetails = null;
      const attendanceState = record ? record.attendanceState : AttendanceState.NOT_CHECKED_IN;

      if (record) {
        status = record.attendanceStatus;
        workHours =
          record.attendanceState === AttendanceState.WORKING ? 0 : Number(record.totalHours || 0);
        overtime = Number(record.overtimeHours || 0);
        lateMinutes = Number(record.lateMinutes || 0);
        checkIn = record.checkInTime;
        checkOut = record.checkOutTime;
        logs = record.logs || [];
        shiftDetails = record.shift || null;
      }

      // Apply status resolution rules
      if (dateStr > todayDateStr) {
        if (isOnLeave) {
          status = matchedLeave?.isHalfDay ? AttendanceStatus.HALF_DAY : AttendanceStatus.ON_LEAVE;
        } else if (isHoliday) {
          status = AttendanceStatus.HOLIDAY;
        } else if (isWeeklyOff) {
          status = AttendanceStatus.WEEK_OFF;
        } else {
          status = AttendanceStatus.UPCOMING;
        }
      } else if (dateStr === todayDateStr) {
        if (status && status !== AttendanceStatus.ABSENT && status !== AttendanceStatus.UPCOMING) {
          // Keep actual status
        } else if (attendanceState === AttendanceState.WORKING || checkIn) {
          status = null;
        } else if (isOnLeave) {
          status = matchedLeave?.isHalfDay ? AttendanceStatus.HALF_DAY : AttendanceStatus.ON_LEAVE;
        } else if (isHoliday) {
          status = AttendanceStatus.HOLIDAY;
        } else if (isWeeklyOff) {
          status = AttendanceStatus.WEEK_OFF;
        } else {
          const [shStartHour, shStartMin] = (shift.startTime || '00:00').split(':').map(Number);
          const shiftStartMinutes = shStartHour * 60 + shStartMin;

          if (minutesOfDay < shiftStartMinutes) {
            status = AttendanceStatus.UPCOMING;
          } else {
            status = AttendanceStatus.ABSENT;
          }
        }
      } else {
        if (status && status !== AttendanceStatus.ABSENT && status !== AttendanceStatus.UPCOMING) {
          // Keep actual status
        } else if (attendanceState === AttendanceState.WORKING || checkIn) {
          status = null;
        } else if (isOnLeave) {
          status = matchedLeave?.isHalfDay ? AttendanceStatus.HALF_DAY : AttendanceStatus.ON_LEAVE;
        } else if (isHoliday) {
          status = AttendanceStatus.HOLIDAY;
        } else if (isWeeklyOff) {
          status = AttendanceStatus.WEEK_OFF;
        } else {
          status = AttendanceStatus.ABSENT;
        }
      }

      const normalizedStatus = this.normalizeLegacyStatus(status);
      const isLate = lateMinutes > 0 || status === 'LATE';

      daysDetails.push({
        date: dateStr,
        checkIn,
        checkOut,
        status: normalizedStatus,
        isLate,
        workHours: parseFloat(workHours.toFixed(2)),
        overtime: parseFloat(overtime.toFixed(2)),
        lateMinutes,
        attendanceState,
        logs,
        shift: shiftDetails,
      });
    }

    const summary = this.buildSummary(daysDetails);

    return {
      summary,
      days: daysDetails,
    };
  }
}
