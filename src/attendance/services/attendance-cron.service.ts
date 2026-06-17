import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceStatus } from '../models/attendance-record.model';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { Shift } from '../models/shift.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Branch } from '../../hrms/models/branch.model';
import { Op, QueryTypes } from 'sequelize';
import { LeaveRequest, LeaveRequestStatus } from '../../hrms/models/leave-request.model';

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
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
  ) {}

  /**
   * Returns the millisecond offset for a given IANA timezone at the current moment.
   * Used to construct timezone-aware Date objects from date+time strings without
   * relying on the server's local timezone.
   */
  private getTzOffsetMs(timezone: string): number {
    try {
      const now = new Date();
      // Get the local time in the target timezone
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      // Get the UTC time
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      // Offset = UTC - TZ (positive for east of UTC like IST +05:30)
      return utcDate.getTime() - tzDate.getTime();
    } catch {
      // Fallback to IST (+05:30 = -19800000ms from UTC perspective of getTimezoneOffset)
      return -19800000;
    }
  }

  // Run at 2:00 AM daily
  @Cron('0 2 * * *')
  async markDailyAbsentees() {
    this.logger.log('Starting daily absent marking process...');

    try {
      // Run for the last 3 days to catch night crossover shifts resiliently
      for (let i = 1; i <= 3; i++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - i);
        const targetDateStr = targetDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        this.logger.log(`Processing absentee records for date: ${targetDateStr}`);

        // Fetch all active employees
        const activeEmployees = await this.employeeModel.findAll({
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
          include: [Branch],
        });

        for (const employee of activeEmployees) {
          const timezone = employee.branch?.timezone || 'Asia/Kolkata';

          // Get day of week for target date in employee's timezone
          const dayOfWeekStr = targetDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
          const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const jsDay = weekdayNames.indexOf(dayOfWeekStr);

          // Check if a record already exists
          const record = await this.recordModel.findOne({
            where: { employeeId: employee.id, date: targetDateStr },
          });

          if (record) {
            // If check-in exists but no check-out, perform auto checkout
            if (record.checkInTime && !record.checkOutTime) {
              // Night Shift crossover safety: if the check-in is less than 14 hours old, skip it
              const checkInAgeMs = new Date().getTime() - new Date(record.checkInTime).getTime();
              const MIN_AGE_TO_AUTO_CHECKOUT = 14 * 60 * 60 * 1000; // 14 hours
              if (checkInAgeMs < MIN_AGE_TO_AUTO_CHECKOUT) {
                this.logger.log(`Employee ID ${employee.id}: Check-in at ${record.checkInTime.toISOString()} is too recent (${Math.round(checkInAgeMs / 3600000)}h ago). Skipping auto-checkout for midnight crossover safety.`);
                continue;
              }

              let shiftEndTime = '18:00';
              if (record.shiftId) {
                const shift = await this.shiftModel.findByPk(record.shiftId);
                if (shift) {
                  shiftEndTime = shift.endTime;
                }
              } else {
                const policy = await this.policyModel.findOne({ where: { companyId: employee.companyId } });
                if (policy) {
                  shiftEndTime = policy.defaultShiftEndTime || '18:00';
                }
              }

              // CRITICAL: Skip auto-checkout if payroll is locked
              if (record.isPayrollLocked) {
                this.logger.log(`Employee ID ${employee.id}: Payroll locked. Skipping auto-checkout.`);
                continue;
              }

              const checkInTime = new Date(record.checkInTime);
              // Construct target date's checkout time using shiftEndTime
              // Use explicit UTC offset (+05:30 for Asia/Kolkata) to avoid server timezone dependency
              const timezone = employee.branch?.timezone || 'Asia/Kolkata';
              const tzOffsetMs = this.getTzOffsetMs(timezone);
              const checkOutTimeVal = new Date(new Date(`${targetDateStr}T${shiftEndTime}:00Z`).getTime() - tzOffsetMs);
              
              // Adjust if checkout time crosses date boundary (night shift)
              if (checkOutTimeVal.getTime() < checkInTime.getTime()) {
                checkOutTimeVal.setTime(checkOutTimeVal.getTime() + 24 * 60 * 60 * 1000);
              }

              // Load breaks to subtract duration
              const logs = await this.recordModel.sequelize!.query(
                `SELECT timestamp, "actionType" FROM "attendance_logs" 
                 WHERE "attendanceRecordId" = :recordId 
                 AND "actionType" IN ('BREAK_START', 'BREAK_END')
                 ORDER BY timestamp ASC;`,
                {
                  replacements: { recordId: record.id },
                  type: QueryTypes.SELECT
                }
              ) as any[];

              let breakDurationMs = 0;
              let currentBreakStart: Date | null = null;
              for (const log of logs) {
                if (log.actionType === 'BREAK_START') {
                  currentBreakStart = new Date(log.timestamp);
                } else if (log.actionType === 'BREAK_END' && currentBreakStart) {
                  breakDurationMs += new Date(log.timestamp).getTime() - currentBreakStart.getTime();
                  currentBreakStart = null;
                }
              }
              if (currentBreakStart) {
                // If break was left open, close it at checkOutTimeVal
                breakDurationMs += checkOutTimeVal.getTime() - currentBreakStart.getTime();
              }

              const totalWorkMs = checkOutTimeVal.getTime() - checkInTime.getTime() - breakDurationMs;
              const totalHours = Math.max(0, parseFloat((totalWorkMs / (1000 * 60 * 60)).toFixed(2)));

              // Determine status based on policy hours or default to PRESENT
              let status = AttendanceStatus.PRESENT;
              if (record.lateMinutes > 0) {
                status = AttendanceStatus.LATE;
              }

              const policy = await this.policyModel.findOne({ where: { companyId: employee.companyId } });
              if (policy) {
                if (totalHours < policy.minHoursForHalfDay) {
                  status = AttendanceStatus.ABSENT;
                } else if (totalHours < policy.minHoursForPresent) {
                  status = AttendanceStatus.HALF_DAY;
                }
              }

              // Check if employee is on approved leave to prevent ABSENT override
              const leave = await this.leaveRequestModel.findOne({
                where: {
                  employeeId: employee.id,
                  status: LeaveRequestStatus.APPROVED,
                  fromDate: { [Op.lte]: targetDateStr },
                  toDate: { [Op.gte]: targetDateStr }
                }
              });

              if (leave) {
                if (!leave.isHalfDay) {
                  status = AttendanceStatus.ON_LEAVE;
                } else if (status === AttendanceStatus.ABSENT) {
                  status = AttendanceStatus.HALF_DAY;
                }
              }

              await record.update({
                checkOutTime: checkOutTimeVal,
                totalHours,
                attendanceStatus: status,
              });
              this.logger.log(`Employee ID ${employee.id}: Checked in but missed checkout. Auto checked-out at ${checkOutTimeVal.toISOString()} with status ${status}.`);
            }
            continue;
          }

          // Check if target date was a company holiday
          const holiday = await this.holidayModel.findOne({
            where: { holidayDate: targetDateStr, isActive: true },
            include: [{
              model: HolidayCompany,
              where: { companyId: employee.companyId },
              required: true,
            }],
          });

          if (holiday) {
            // Skip marking absent on public/company holidays
            continue;
          }

          // Check if employee is on approved leave
          const leave = await this.leaveRequestModel.findOne({
            where: {
              employeeId: employee.id,
              status: LeaveRequestStatus.APPROVED,
              fromDate: { [Op.lte]: targetDateStr },
              toDate: { [Op.gte]: targetDateStr }
            }
          });

          try {
            if (leave) {
              // Create an ON_LEAVE record
              await this.recordModel.create({
                employeeId: employee.id,
                companyId: employee.companyId,
                date: targetDateStr,
                attendanceStatus: AttendanceStatus.ON_LEAVE,
                totalHours: 0,
                overtimeHours: 0,
                lateMinutes: 0,
                shiftId: employee.shiftId || null,
              } as any);
              this.logger.log(`Employee ID ${employee.id} is on approved leave. Marked as ON_LEAVE.`);
              continue;
            }

            // Get weekly off days configuration
            let weeklyOffDays = [0, 6];
            if (employee.shiftId) {
              const shift = await this.shiftModel.findByPk(employee.shiftId);
              if (shift) {
                weeklyOffDays = shift.weeklyOffDays;
              }
            } else {
              const policy = await this.policyModel.findOne({ where: { companyId: employee.companyId } });
              if (policy) {
                weeklyOffDays = policy.weeklyOffDays;
              }
            }

            const isWeeklyOff = weeklyOffDays.includes(jsDay);

            if (isWeeklyOff) {
              // Create a WEEK_OFF record
              await this.recordModel.create({
                employeeId: employee.id,
                companyId: employee.companyId,
                date: targetDateStr,
                attendanceStatus: AttendanceStatus.WEEK_OFF,
                totalHours: 0,
                overtimeHours: 0,
                lateMinutes: 0,
                shiftId: employee.shiftId || null,
              } as any);
            } else {
              // Create an ABSENT record
              await this.recordModel.create({
                employeeId: employee.id,
                companyId: employee.companyId,
                date: targetDateStr,
                attendanceStatus: AttendanceStatus.ABSENT,
                totalHours: 0,
                overtimeHours: 0,
                lateMinutes: 0,
                shiftId: employee.shiftId || null,
              } as any);
            }
          } catch (error: any) {
            if (error.name !== 'SequelizeUniqueConstraintError') {
              this.logger.error(`Error creating attendance record for employee ${employee.id} on date ${targetDateStr}`, error);
            }
          }
        }
      }

      this.logger.log('Absent marking process completed successfully.');
    } catch (error) {
      this.logger.error('Failed to execute absent marking cron job', error);
    }
  }
}
