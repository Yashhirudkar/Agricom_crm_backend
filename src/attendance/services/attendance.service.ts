import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceStatus, AttendanceState, AttendanceSource } from '../models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../models/attendance-log.model';
import { AttendanceException, AttendanceExceptionType, AttendanceExceptionStatus } from '../models/attendance-exception.model';
import { Shift } from '../models/shift.model';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { LeaveRequest, LeaveRequestStatus } from '../../hrms/models/leave-request.model';
import { EmployeeLeaveBalance } from '../../hrms/models/employee-leave-balance.model';
import { LeaveType } from '../../hrms/models/leave-type.model';
import { Branch } from '../../hrms/models/branch.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { CheckInDto, CheckOutDto, BreakStartDto, BreakEndDto, RequestCorrectionDto, ResolveCorrectionDto } from '../dto/attendance.dto';
import { Op, Transaction } from 'sequelize';
import { AttendanceGateway } from '../gateways/attendance.gateway';
import { AttendanceHelperService } from './attendance-helper.service';
import { AttendanceReportService } from './attendance-report.service';
import { AttendanceAdminService } from './attendance-admin.service';
import { AttendanceRegularizationService } from './attendance-regularization.service';
import { AttendanceExceptionsQueryService } from './attendance-exceptions-query.service';
import { User } from '../../users/models/user.model';
import { Designation } from '../../hrms/models/designation.model';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(AttendanceLog)
    private readonly logModel: typeof AttendanceLog,
    @InjectModel(AttendanceException)
    private readonly exceptionModel: typeof AttendanceException,
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
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(LeaveType)
    private readonly leaveTypeModel: typeof LeaveType,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly helperService: AttendanceHelperService,
    private readonly reportService: AttendanceReportService,
    private readonly adminService: AttendanceAdminService,
    private readonly regularizationService: AttendanceRegularizationService,
    private readonly exceptionsQueryService: AttendanceExceptionsQueryService,
  ) {}

  // 1. Employee Check In
  async checkIn(employeeId: number, companyId: number, dto: CheckInDto): Promise<AttendanceRecord> {
    const employee = await this.helperService.getActiveEmployee(employeeId, companyId);
    this.helperService.validateGeoLocation(employee, dto.locationLat, dto.locationLng);
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr, minutesOfDay, jsDay } = this.helperService.getLocalTimeDetails(timezone);

    // Holiday Check
    const holiday = await this.holidayModel.findOne({
      where: { holidayDate: todayDateStr, isActive: true },
      include: [{
        model: HolidayCompany,
        where: { companyId },
        required: true,
      }],
    });
    if (holiday) {
      throw new BadRequestException(`Check-in blocked: today (${todayDateStr}) is a company holiday: ${holiday.title}`);
    }

    // Leave Check
    const activeLeave = await this.leaveRequestModel.findOne({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.lte]: todayDateStr },
        toDate: { [Op.gte]: todayDateStr }
      }
    });

    if (activeLeave) {
      throw new ConflictException(`Check-in blocked: You have an approved leave for today. Please cancel your leave if you intend to work.`);
    }

    // Resolve Shift details
    const targetShiftId = dto.shiftId || employee.shiftId;
    let shift: any = null;
    const policy = await this.policyModel.findOne({ where: { companyId } });

    if (targetShiftId) {
      shift = await this.shiftModel.findOne({ where: { id: targetShiftId, companyId } });
    }

    if (!shift) {
      // Fallback virtual shift from HR Policy
      shift = {
        id: null,
        name: 'Default Shift',
        startTime: policy?.defaultShiftStartTime || '09:00',
        endTime: policy?.defaultShiftEndTime || '18:00',
        breakMinutes: 60,
        gracePeriodMinutes: policy?.lateComingGraceMinutes || 15,
        weeklyOffDays: policy?.weeklyOffDays || [0, 6],
      };
    }

    // Determine status & late minutes
    const isWeeklyOff = shift.weeklyOffDays.includes(jsDay);
    const lateMinutes = this.helperService.calculateLateMinutes(minutesOfDay, shift.startTime, shift.gracePeriodMinutes);
    let initialStatus = null; // Do not set PRESENT on check-in

    const t = await this.recordModel.sequelize!.transaction();

    try {
      // row locking check-in record for today
      let record = await this.recordModel.findOne({
        where: { employeeId, date: todayDateStr },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (record && record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }

      if (record && record.attendanceState === AttendanceState.WORKING) {
        throw new ConflictException('You are already checked in');
      }

      const currentPunchTime = new Date();
      const checkInTime = record?.checkInTime || currentPunchTime;

      if (!record) {
        record = await this.recordModel.create({
          employeeId,
          companyId,
          date: todayDateStr,
          checkInTime,
          attendanceStatus: initialStatus,
          attendanceState: AttendanceState.WORKING,
          attendanceSource: AttendanceSource.SELF_PUNCH,
          lateMinutes,
          locationLat: dto.locationLat || null,
          locationLng: dto.locationLng || null,
          shiftId: shift.id,
        } as any, { transaction: t });
      } else {
        await record.update({
          attendanceState: AttendanceState.WORKING,
          checkInTime: currentPunchTime,
          checkOutTime: null,
          totalHours: 0,
          overtimeHours: 0,
          attendanceSource: AttendanceSource.SELF_PUNCH,
          lateMinutes: record.checkInTime ? record.lateMinutes : lateMinutes,
          locationLat: dto.locationLat || null,
          locationLng: dto.locationLng || null,
          shiftId: shift.id,
        }, { transaction: t });
        await record.reload({ transaction: t });
      }

      // Create log
      await this.logModel.create({
        employeeId,
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.CHECK_IN,
        timestamp: currentPunchTime,
        metadata: {
          locationLat: dto.locationLat,
          locationLng: dto.locationLng,
          biometricVerificationId: dto.biometricVerificationId,
          verificationMethod: dto.verificationMethod || 'WEB',
          shiftUsed: shift.name,
        },
      } as any, { transaction: t });

      await t.commit();

      // After committing, fetch a fresh record to ensure all values are up-to-date from the database.
      // This bypasses any potential in-transaction caching or staleness of the 'record' instance.
      const freshRecord = await this.recordModel.findByPk(record.id);

      try {
        this.attendanceGateway.emitCheckedIn(freshRecord);
      } catch (err) {
        console.error('Socket emit error in checkIn:', err);
      }

      return freshRecord;
    } catch (error: any) {
      await t.rollback();
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ConflictException('You have already checked in for today');
      }
      throw error;
    }
  }

  // 2. Employee Check Out
  async checkOut(employeeId: number, companyId: number, dto: CheckOutDto): Promise<AttendanceRecord> {
    const employee = await this.helperService.getActiveEmployee(employeeId, companyId);
    this.helperService.validateGeoLocation(employee, dto.locationLat, dto.locationLng);
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr } = this.helperService.getLocalTimeDetails(timezone);

    const t = await this.recordModel.sequelize!.transaction();

    try {
      let record = await this.recordModel.findOne({
        where: { employeeId, date: todayDateStr },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      // Night shift date boundary crossover check
      if (!record || record.checkOutTime) {
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const { todayDateStr: yesterdayDateStr } = this.helperService.getLocalTimeDetails(timezone, yesterdayDate);

        const yesterdayRecord = await this.recordModel.findOne({
          where: { employeeId, date: yesterdayDateStr, checkOutTime: null },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (yesterdayRecord && yesterdayRecord.checkInTime) {
          record = yesterdayRecord;
        }
      }

      if (!record || !record.checkInTime) {
        throw new BadRequestException('Cannot check out without checking in first');
      }

      if (record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }

      if (record.attendanceState !== AttendanceState.WORKING && record.attendanceState !== AttendanceState.ON_BREAK) {
        throw new ConflictException('You are not currently checked in');
      }

      const checkOutTime = new Date();
      const checkInTime = new Date(record.checkInTime);

      // Load ALL logs for today (CHECK_IN, CHECK_OUT, BREAK_START, BREAK_END)
      const logs = await this.logModel.findAll({
        where: {
          attendanceRecordId: record.id,
        },
        order: [['timestamp', 'ASC']],
        transaction: t,
      });

      let breakDurationMs = 0;
      let breakStart: Date | null = null;

      for (const log of logs) {
        if (log.actionType === AttendanceActionType.BREAK_START) {
          breakStart = new Date(log.timestamp);
        } else if (log.actionType === AttendanceActionType.BREAK_END && breakStart) {
          breakDurationMs += log.timestamp.getTime() - breakStart.getTime();
          breakStart = null;
        }
      }

      // Calculate total work from CURRENT checkInTime to avoid stale sessions
      let totalWorkMs = checkOutTime.getTime() - checkInTime.getTime();

      if (breakStart) {
        // Log auto break end if checked out during break
        breakDurationMs += checkOutTime.getTime() - breakStart.getTime();
        await this.logModel.create({
          employeeId,
          attendanceRecordId: record.id,
          actionType: AttendanceActionType.BREAK_END,
          timestamp: checkOutTime,
          metadata: { autoClosed: true, reason: 'Checked out during break' },
        } as any, { transaction: t });
        // Deduct current ongoing break from total work time (since lastIn tracks check-in)
        totalWorkMs -= (checkOutTime.getTime() - breakStart.getTime());
      }

      const totalHours = Math.max(0, parseFloat((totalWorkMs / (1000 * 60 * 60)).toFixed(2)));

      // Fetch policy details
      const policy = await this.policyModel.findOne({ where: { companyId }, transaction: t });

      // Determine shift duration to calculate overtime
      let shift: any = null;
      if (record.shiftId) {
        shift = await this.shiftModel.findByPk(record.shiftId, { transaction: t });
      }

      if (!shift) {
        shift = {
          startTime: policy?.defaultShiftStartTime || '09:00',
          endTime: policy?.defaultShiftEndTime || '18:00',
          breakMinutes: 60,
          gracePeriodMinutes: policy?.lateComingGraceMinutes || 15,
        };
      }

      const [shStart, smStart] = shift.startTime.split(':').map(Number);
      const [shEnd, smEnd] = shift.endTime.split(':').map(Number);
      let shiftDiff = (shEnd * 60 + smEnd) - (shStart * 60 + smStart);
      if (shiftDiff < 0) {
        shiftDiff += 24 * 60; // night shift crossover
      }
      const shiftHours = Math.max(0, (shiftDiff - (shift.breakMinutes || 0)) / 60);

      // Overtime
      let overtimeHours = 0;
      if (policy?.overtimeAllowed && totalHours > shiftHours) {
        overtimeHours = parseFloat((totalHours - shiftHours).toFixed(2));
      }

      // Determine status from working hours
      const minHoursPresent = policy?.minHoursForPresent !== undefined ? Number(policy.minHoursForPresent) : 8;
      const minHoursHalfDay = policy?.minHoursForHalfDay !== undefined ? Number(policy.minHoursForHalfDay) : 4;

      let finalStatus = AttendanceStatus.PRESENT;

      if (totalHours < minHoursHalfDay) {
        finalStatus = AttendanceStatus.ABSENT;
      } else if (totalHours < minHoursPresent) {
        finalStatus = AttendanceStatus.HALF_DAY;
      } else if (record.lateMinutes > 0) {
        finalStatus = AttendanceStatus.LATE;
      }

      // Protect against ABSENT override if employee has an approved leave for this date
      const activeLeave = await this.leaveRequestModel.findOne({
        where: {
          employeeId,
          status: LeaveRequestStatus.APPROVED,
          fromDate: { [Op.lte]: record.date },
          toDate: { [Op.gte]: record.date }
        },
        transaction: t,
      });

      if (activeLeave) {
        if (!activeLeave.isHalfDay) {
          finalStatus = AttendanceStatus.ON_LEAVE;
        } else if (finalStatus === AttendanceStatus.ABSENT) {
          finalStatus = AttendanceStatus.HALF_DAY;
        }
      }

      await record.update({
        checkOutTime,
        totalHours,
        overtimeHours,
        attendanceStatus: finalStatus,
        attendanceState: AttendanceState.CHECKED_OUT,
      }, { transaction: t });
      await record.reload({ transaction: t });

      await this.logModel.create({
        employeeId,
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.CHECK_OUT,
        timestamp: checkOutTime,
        metadata: {
          locationLat: dto.locationLat,
          locationLng: dto.locationLng,
          biometricVerificationId: dto.biometricVerificationId,
          verificationMethod: dto.verificationMethod || 'WEB',
          totalHours,
          overtimeHours,
          breakDurationMinutes: Math.round(breakDurationMs / (1000 * 60)),
        },
      } as any, { transaction: t });

      await t.commit();

      try {
        this.attendanceGateway.emitCheckedOut(record);
      } catch (err) {
        console.error('Socket emit error in checkOut:', err);
      }

      return record;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // 3. Break Start (DEPRECATED)
  async breakStart(employeeId: number, companyId: number, dto: BreakStartDto): Promise<AttendanceLog> {
    throw new ForbiddenException('Manual breaks are disabled by company policy. Breaks are recorded automatically.');
  }

  // 4. Break End (DEPRECATED)
  async breakEnd(employeeId: number, companyId: number, dto: BreakEndDto): Promise<AttendanceLog> {
    throw new ForbiddenException('Manual breaks are disabled by company policy. Breaks are recorded automatically.');
  }

  // 5. Attendance Correction Request
  async requestCorrection(employeeId: number, companyId: number, dto: RequestCorrectionDto): Promise<AttendanceException> {
    return this.regularizationService.requestCorrection(employeeId, companyId, dto);
  }

  // 6. Approve Correction Request
  async approveCorrection(exceptionId: number, companyId: number, approverEmployeeId: number, approverType: string, dto: ResolveCorrectionDto): Promise<AttendanceException> {
    return this.regularizationService.approveCorrection(exceptionId, companyId, approverEmployeeId, approverType, dto);
  }

  // 7. Reject Correction Request
  async rejectCorrection(exceptionId: number, approverEmployeeId: number, approverType: string, dto: ResolveCorrectionDto): Promise<AttendanceException> {
    return this.regularizationService.rejectCorrection(exceptionId, approverEmployeeId, approverType, dto);
  }

  async getPendingCorrections(companyId: number): Promise<AttendanceException[]> {
    return this.exceptionsQueryService.getPendingCorrections(companyId);
  }

  async getRegularizationHistory(companyId: number, query: any): Promise<any> {
    return this.exceptionsQueryService.getRegularizationHistory(companyId, query);
  }

  // 8. Get Own Attendance (Self)
  async getMyAttendance(employeeId: number, companyId: number, filters: { startDate?: string, endDate?: string }): Promise<any> {
    return this.reportService.getMyAttendance(employeeId, companyId, filters);
  }

  // 9. Get Company Attendance
  async getCompanyAttendance(companyId: number, filters: { date?: string, employeeId?: number }): Promise<AttendanceRecord[]> {
    return this.reportService.getCompanyAttendance(companyId, filters);
  }

  // 10. Monthly Attendance Report
  async getMonthlyReport(companyId: number, query: { month: number; year: number; employeeId?: number }): Promise<any> {
    return this.reportService.getMonthlyReport(companyId, query);
  }

  // 11. Assign Shift to Employee
  async assignShift(employeeId: number, companyId: number, shiftId: number): Promise<Employee> {
    return this.adminService.assignShift(employeeId, companyId, shiftId);
  }

  // 12. Manual Override (Admin direct action)
  async manualOverride(
    recordId: number,
    companyId: number,
    adminEmployeeId: number,
    dto: { checkInTime?: string; checkOutTime?: string; attendanceStatus?: AttendanceStatus; lateMinutes?: number; remarks?: string }
  ): Promise<AttendanceRecord> {
    return this.adminService.manualOverride(recordId, companyId, adminEmployeeId, dto);
  }

  // Admin fallback helper
  async getFallbackEmployeeIdForAdmin(companyId: number): Promise<number | null> {
    return this.adminService.getFallbackEmployeeIdForAdmin(companyId);
  }

  // 13. Admin Manual Attendance Entry
  async manualAttendance(
    companyId: number,
    adminEmployeeId: number,
    dto: { employeeId: number; date: string; checkInTime?: string; checkOutTime?: string; status: AttendanceStatus; leaveTypeId?: number; reason?: string }
  ): Promise<AttendanceRecord> {
    return this.adminService.manualAttendance(companyId, adminEmployeeId, dto);
  }

}
