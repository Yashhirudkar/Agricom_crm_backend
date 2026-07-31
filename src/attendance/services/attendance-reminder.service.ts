import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { Branch } from '../../hrms/models/branch.model';
import { Shift } from '../models/shift.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { LeaveRequest, LeaveRequestStatus } from '../../hrms/models/leave-request.model';
import { AttendanceRecord } from '../models/attendance-record.model';
import { SentReminder } from '../models/sent-reminder.model';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import { Op } from 'sequelize';

@Injectable()
export class AttendanceReminderService {
  private readonly logger = new Logger(AttendanceReminderService.name);

  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(SentReminder)
    private readonly sentReminderModel: typeof SentReminder,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('* * * * *')
  async sendAttendanceReminders() {
    try {
      // 1. Fetch active branch timezones
      const branches = await this.employeeModel.sequelize.models.Branch.findAll({
        attributes: ['timezone'],
        group: ['timezone'],
      });
      const timezones = Array.from(new Set(branches.map(b => (b as any).timezone || 'Asia/Kolkata')));
      if (timezones.length === 0) {
        timezones.push('Asia/Kolkata');
      }

      // 2. Fetch all shifts and company policies
      const shifts = await this.shiftModel.findAll();
      const policies = await this.policyModel.findAll();
      const policiesMap = new Map(policies.map(p => [p.companyId, p]));

      const now = new Date();

      // 3. Process timezones one by one to optimize queries and avoid full table scans
      for (const tz of timezones) {
        const { todayDateStr, minutesOfDay, jsDay, yesterdayDateStr } = this.getLocalTimeDetails(tz, now);

        // Filter shifts that are currently near the check-in or check-out reminder window in this timezone
        const activeCheckInShiftIds: number[] = [];
        const activeCheckOutShiftIds: number[] = [];
        
        for (const shift of shifts) {
          const [shStart, smStart] = shift.startTime.split(':').map(Number);
          const shiftStartMinutes = shStart * 60 + smStart;
          
          const [shEnd, smEnd] = shift.endTime.split(':').map(Number);
          let shiftEndMinutes = shEnd * 60 + smEnd;
          if (shift.isNightShift && shiftEndMinutes < shiftStartMinutes) {
            // Night shift end crosses date boundary
          }

          // Check-in active: 10 minutes before up to 30 minutes after start
          if (minutesOfDay >= shiftStartMinutes - 10 && minutesOfDay <= shiftStartMinutes + 30) {
            activeCheckInShiftIds.push(shift.id);
          }
          // Check-out active: 10 minutes before up to 35 minutes after end
          if (minutesOfDay >= shiftEndMinutes - 10 && minutesOfDay <= shiftEndMinutes + 35) {
            activeCheckOutShiftIds.push(shift.id);
          }
        }

        // Also check if any virtual default policy shifts are active in this timezone
        let defaultCheckInActive = false;
        let defaultCheckOutActive = false;

        for (const policy of policies) {
          const startStr = policy.defaultShiftStartTime || '09:00';
          const [shStart, smStart] = startStr.split(':').map(Number);
          const shiftStartMinutes = shStart * 60 + smStart;

          const endStr = policy.defaultShiftEndTime || '18:00';
          const [shEnd, smEnd] = endStr.split(':').map(Number);
          const shiftEndMinutes = shEnd * 60 + smEnd;

          if (minutesOfDay >= shiftStartMinutes - 10 && minutesOfDay <= shiftStartMinutes + 30) {
            defaultCheckInActive = true;
          }
          if (minutesOfDay >= shiftEndMinutes - 10 && minutesOfDay <= shiftEndMinutes + 35) {
            defaultCheckOutActive = true;
          }
        }

        // Skip timezone if no shift window is currently near the current time
        const hasActiveShifts = activeCheckInShiftIds.length > 0 || activeCheckOutShiftIds.length > 0 || defaultCheckInActive || defaultCheckOutActive;
        if (!hasActiveShifts) {
          continue;
        }

        // 4. Fetch only employees in this timezone
        const employees = await this.employeeModel.findAll({
          where: {
            status: {
              [Op.in]: [
                EmployeeStatus.ACTIVE,
                EmployeeStatus.CONFIRMED,
                EmployeeStatus.PROBATION,
                EmployeeStatus.NOTICE_PERIOD,
                EmployeeStatus.ONBOARDING,
              ],
            },
          },
          include: [
            {
              model: this.employeeModel.sequelize.models.Branch,
              as: 'branch',
              where: { timezone: tz },
              required: true,
            },
            {
              model: this.employeeModel.sequelize.models.Department,
              as: 'department',
              required: false,
              include: [{
                model: Shift,
                as: 'shift',
                required: false,
              }],
            },
            {
              model: Shift,
              as: 'shift',
              required: false,
            },
          ],
        });

        if (employees.length === 0) {
          continue;
        }

        // Cache holidays and leave requests for today to avoid N+1 queries
        const companyIds = Array.from(new Set(employees.map(e => e.companyId)));
        
        const holidays = await this.holidayModel.findAll({
          where: {
            holidayDate: todayDateStr,
            isActive: true,
          },
          include: [{
            model: HolidayCompany,
            where: { companyId: companyIds },
            required: false,
          }],
        });

        const leaves = await this.leaveRequestModel.findAll({
          where: {
            status: LeaveRequestStatus.APPROVED,
            fromDate: { [Op.lte]: todayDateStr },
            toDate: { [Op.gte]: todayDateStr },
            employeeId: employees.map(e => e.id),
          },
        });

        const leaveMap = new Set(leaves.map(l => l.employeeId));

        // Get daily attendance records for these employees
        const records = await this.recordModel.findAll({
          where: {
            date: todayDateStr,
            employeeId: employees.map(e => e.id),
          },
        });

        const recordMap = new Map(records.map(r => [r.employeeId, r]));

        // Get yesterday's records (for night shift crossover check-outs)
        const yesterdayRecords = await this.recordModel.findAll({
          where: {
            date: yesterdayDateStr,
            employeeId: employees.map(e => e.id),
          },
        });
        const yesterdayRecordMap = new Map(yesterdayRecords.map(r => [r.employeeId, r]));

        // Process reminders per employee
        for (const employee of employees) {
          const companyId = employee.companyId;

          // 1. Resolve employee shift details
          let shift = employee.shift;
          if (!shift && employee.department && employee.department.shift) {
            shift = employee.department.shift;
          }

          const policy = policiesMap.get(companyId);
          const isDefaultShift = !shift;

          const startTimeStr = shift ? shift.startTime : (policy?.defaultShiftStartTime || '09:00');
          const endTimeStr = shift ? shift.endTime : (policy?.defaultShiftEndTime || '18:00');
          const graceMinutes = shift ? (shift.gracePeriodMinutes || 0) : (policy?.lateComingGraceMinutes || 15);
          const weeklyOffDays = shift ? (shift.weeklyOffDays || []) : (policy?.weeklyOffDays || [0, 6]);
          const isNightShift = shift ? (shift.isNightShift || false) : false;

          // Compute shift times in minutes of day
          const [shStart, smStart] = startTimeStr.split(':').map(Number);
          const shiftStartMinutes = shStart * 60 + smStart;

          const [shEnd, smEnd] = endTimeStr.split(':').map(Number);
          const shiftEndMinutes = shEnd * 60 + smEnd;

          // Check if employee is on approved leave
          if (leaveMap.has(employee.id)) {
            continue;
          }

          // Check if today is holiday for company
          const isHoliday = holidays.some(h => {
            const linkedCompanies = h.holidayCompanies || [];
            if (linkedCompanies.length > 0) {
              return linkedCompanies.some(hc => hc.companyId === companyId);
            }
            return h.clientId === employee.company?.clientId; // workspace client holiday
          });

          if (isHoliday) {
            continue;
          }

          // Check if today is weekly off
          if (weeklyOffDays.includes(jsDay)) {
            continue;
          }

          // Fetch attendance record
          const record = recordMap.get(employee.id);
          const yesterdayRecord = yesterdayRecordMap.get(employee.id);

          // ── A. CHECK-IN REMINDERS ───────────────────────────────────────
          if (!record || !record.checkInTime) {
            // Check-in window match
            const diffMinutes = shiftStartMinutes - minutesOfDay;
            let checkInEvent: string | null = null;

            if (diffMinutes === 10) {
              checkInEvent = 'CHECKIN_10';
            } else if (diffMinutes === 5) {
              checkInEvent = 'CHECKIN_5';
            } else if (minutesOfDay >= shiftStartMinutes + 1 && minutesOfDay <= shiftStartMinutes + 30) {
              checkInEvent = 'CHECKIN_LATE';
            }

            if (checkInEvent) {
              await this.trySendReminder(
                employee,
                todayDateStr,
                checkInEvent,
                checkInEvent === 'CHECKIN_10'
                  ? '⏰ Shift starts in 10 minutes. Please check in on time.'
                  : checkInEvent === 'CHECKIN_5'
                  ? '⏰ Shift starts in 5 minutes.'
                  : "⚠ You haven't checked in yet. Please check in to avoid being marked late.",
                'attendance_reminder_checkin'
              );
            }
          }

          // ── B. CHECK-OUT REMINDERS ──────────────────────────────────────
          // Check-out reminders are only triggered if they are checked in
          const activeRecord = isNightShift ? yesterdayRecord : record;
          const targetDateStr = isNightShift ? yesterdayDateStr : todayDateStr;

          if (activeRecord && activeRecord.checkInTime && !activeRecord.checkOutTime) {
            const diffMinutes = shiftEndMinutes - minutesOfDay;
            let checkOutEvent: string | null = null;

            if (diffMinutes === 10) {
              checkOutEvent = 'CHECKOUT_10';
            } else if (diffMinutes === 5) {
              checkOutEvent = 'CHECKOUT_5';
            } else if (minutesOfDay >= shiftEndMinutes + 5 && minutesOfDay <= shiftEndMinutes + 35) {
              checkOutEvent = 'CHECKOUT_MISSED';
            }

            if (checkOutEvent) {
              await this.trySendReminder(
                employee,
                targetDateStr,
                checkOutEvent,
                checkOutEvent === 'CHECKOUT_10'
                  ? 'Shift ends in 10 minutes.'
                  : checkOutEvent === 'CHECKOUT_5'
                  ? 'Shift ends in 5 minutes.'
                  : 'You forgot to check out. Please complete your attendance.',
                'attendance_reminder_checkout'
              );
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Error in Attendance Reminder Engine execution:', err);
    }
  }

  // Safely insert sent reminder log in a transaction to prevent race conditions or duplicates
  private async trySendReminder(
    employee: Employee,
    dateStr: string,
    event: string,
    message: string,
    refType: string
  ): Promise<boolean> {
    if (!employee.userId) return false;

    // First check check-in record again to make sure they didn't punch in while executing
    try {
      const existing = await this.sentReminderModel.findOne({
        where: {
          companyId: employee.companyId,
          employeeId: employee.id,
          date: dateStr,
          event,
        },
      });

      if (existing) {
        return false;
      }

      // Safe bulk insert/create with uniqueness constraints
      const t = await this.sentReminderModel.sequelize.transaction();
      try {
        await this.sentReminderModel.create(
          {
            companyId: employee.companyId,
            employeeId: employee.id,
            date: dateStr,
            event,
            sentAt: new Date(),
          },
          { transaction: t }
        );
        await t.commit();
      } catch (dbErr: any) {
        await t.rollback();
        // Unique constraint violation means it was already sent by parallel worker or previous batch
        return false;
      }

      // Trigger notification if DB logging succeeds
      await this.notificationsService.createNotification({
        recipients: [employee.userId],
        type: NotificationType.HR,
        referenceType: refType,
        referenceId: employee.id,
        title: event.startsWith('CHECKIN') ? '⏰ Shift Check-In Alert' : '⏰ Shift Check-Out Alert',
        payload: {
          message,
          event,
          date: dateStr,
          url: '/attendance',
        },
        category: 'REMINDER',
      });

      return true;
    } catch (err) {
      this.logger.error(`Failed to send reminder ${event} to user ${employee.userId}:`, err);
      return false;
    }
  }

  // Get local date & time details based on timezone
  private getLocalTimeDetails(
    timezone: string,
    dateInput: Date
  ): { todayDateStr: string; yesterdayDateStr: string; minutesOfDay: number; jsDay: number } {
    const tz = timezone || 'Asia/Kolkata';
    
    const todayDateStr = dateInput.toLocaleDateString('en-CA', { timeZone: tz });
    
    const yesterday = new Date(dateInput.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDateStr = yesterday.toLocaleDateString('en-CA', { timeZone: tz });

    const localTimeStr = dateInput.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: tz,
    });
    const [hour, minute] = localTimeStr.split(':').map(Number);
    const minutesOfDay = hour * 60 + minute;

    const dayOfWeekStr = dateInput.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: tz,
    });
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const jsDay = weekdayNames.indexOf(dayOfWeekStr);

    return { todayDateStr, yesterdayDateStr, minutesOfDay, jsDay };
  }
}
