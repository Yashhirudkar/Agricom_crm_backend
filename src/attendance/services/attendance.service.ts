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
  ) {}

  // Helper: Get local date & time details based on timezone
  private getLocalTimeDetails(timezone = 'Asia/Kolkata', inputDate = new Date()): { todayDateStr: string, minutesOfDay: number, jsDay: number } {
    const tz = timezone || 'Asia/Kolkata';
    const todayDateStr = inputDate.toLocaleDateString('en-CA', { timeZone: tz });
    
    // Format to HH:MM:SS (24-hour)
    const localTimeStr = inputDate.toLocaleTimeString('en-US', { hour12: false, timeZone: tz });
    const [hour, minute] = localTimeStr.split(':').map(Number);
    const minutesOfDay = hour * 60 + minute;

    // Get JS day of week (0 = Sunday, 1 = Monday, etc.) in target timezone
    const dayOfWeekStr = inputDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const jsDay = weekdayNames.indexOf(dayOfWeekStr);

    return { todayDateStr, minutesOfDay, jsDay };
  }

  // Helper: Calculate distance between coordinates (Haversine formula)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  // Helper: Verify and enforce geo-fencing configuration
  private validateGeoLocation(employee: Employee, lat?: number, lng?: number) {
    if (lat !== undefined && lng !== undefined) {
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new BadRequestException('Invalid geolocation coordinates.');
      }
    }

    const branch = employee.branch;
    if (branch && branch.latitude !== null && branch.longitude !== null && branch.geoFenceRadius !== null) {
      if (employee.workMode === 'OFFICE') {
        if (lat === undefined || lng === undefined) {
          throw new BadRequestException('Location coordinates are required for office work mode check-in');
        }

        const distance = this.calculateDistance(lat, lng, branch.latitude, branch.longitude);
        if (distance > branch.geoFenceRadius) {
          throw new BadRequestException(
            `Geo-fence verification failed: You are outside the branch boundary by ${Math.round(distance - branch.geoFenceRadius)} meters.`,
          );
        }
      }
    }
  }

  // Helper: Calculate late minutes
  private calculateLateMinutes(minutesOfDay: number, shiftStartTime: string, gracePeriod: number): number {
    const [shiftHour, shiftMin] = shiftStartTime.split(':').map(Number);
    const shiftMinutes = shiftHour * 60 + shiftMin;

    if (minutesOfDay > (shiftMinutes + gracePeriod)) {
      return minutesOfDay - shiftMinutes;
    }
    return 0;
  }

  // Helper: Verify if employee is linked and active
  private async getActiveEmployee(employeeId: number, companyId: number): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
      include: [Branch],
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found in this company workspace');
    }

    const inactiveStatuses = [EmployeeStatus.DRAFT, EmployeeStatus.RESIGNED, EmployeeStatus.TERMINATED];
    if (inactiveStatuses.includes(employee.status)) {
      throw new ForbiddenException(`Employee account is inactive (Status: ${employee.status})`);
    }

    return employee;
  }

  // 1. Employee Check In
  async checkIn(employeeId: number, companyId: number, dto: CheckInDto): Promise<AttendanceRecord> {
    const employee = await this.getActiveEmployee(employeeId, companyId);
    this.validateGeoLocation(employee, dto.locationLat, dto.locationLng);
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr, minutesOfDay, jsDay } = this.getLocalTimeDetails(timezone);

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
    const lateMinutes = this.calculateLateMinutes(minutesOfDay, shift.startTime, shift.gracePeriodMinutes);
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
    const employee = await this.getActiveEmployee(employeeId, companyId);
    this.validateGeoLocation(employee, dto.locationLat, dto.locationLng);
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr } = this.getLocalTimeDetails(timezone);

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
        const { todayDateStr: yesterdayDateStr } = this.getLocalTimeDetails(timezone, yesterdayDate);

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
    const employee = await this.getActiveEmployee(employeeId, companyId);
    const policy = await this.policyModel.findOne({ where: { companyId } });

    if (!policy || !policy.allowAttendanceCorrection) {
      throw new ForbiddenException('Attendance corrections are not allowed by company policy');
    }

    // Leave Check
    const activeLeave = await this.leaveRequestModel.findOne({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.lte]: dto.date },
        toDate: { [Op.gte]: dto.date }
      }
    });

    if (activeLeave) {
      throw new ConflictException(`Regularization blocked: You have an approved leave for ${dto.date}.`);
    }

    // Check age of request
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr } = this.getLocalTimeDetails(timezone);
    const todayDate = new Date(todayDateStr);
    const requestDate = new Date(dto.date);

    const diffTime = Math.abs(todayDate.getTime() - requestDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > (policy.maxCorrectionDays || 3)) {
      throw new BadRequestException(
        `Correction requests are limited to within ${policy.maxCorrectionDays} days (Requested date: ${dto.date}, Current date: ${todayDateStr})`,
      );
    }

    // Load existing record for the date if it exists
    const record = await this.recordModel.findOne({
      where: { employeeId, date: dto.date },
    });

    if (record && record.isPayrollLocked) {
      throw new ForbiddenException('Attendance locked after payroll processing');
    }

    // Validations based on type
    if (dto.requestType === AttendanceExceptionType.REGULARIZATION && !record) {
      throw new BadRequestException('No attendance record exists for this date to correct. Use MISSED_PUNCH instead.');
    }

    // Check if there is already a PENDING exception request for this date or record
    const pendingExceptions = await this.exceptionModel.findAll({
      where: {
        employeeId,
        status: AttendanceExceptionStatus.PENDING
      }
    });

    const hasDuplicate = pendingExceptions.some(exc => {
      if (record && exc.attendanceRecordId === record.id) return true;
      if (exc.metadata && exc.metadata.date === dto.date) return true;
      return false;
    });

    if (hasDuplicate) {
      throw new BadRequestException('A pending correction request already exists for this date.');
    }

    return this.exceptionModel.create({
      employeeId,
      attendanceRecordId: record ? record.id : null,
      type: dto.requestType,
      reason: dto.reason,
      status: AttendanceExceptionStatus.PENDING,
      metadata: {
        proposedCheckInTime: dto.checkInTime,
        proposedCheckOutTime: dto.checkOutTime,
        date: dto.date,
      },
    } as any);
  }

  // 6. Approve Correction Request
  async approveCorrection(exceptionId: number, companyId: number, approverEmployeeId: number, approverType: string, dto: ResolveCorrectionDto): Promise<AttendanceException> {
    const exception = await this.exceptionModel.findByPk(exceptionId, {
      include: [{ model: Employee, as: 'employee' }],
    });

    if (!exception) {
      throw new NotFoundException(`Correction request with ID ${exceptionId} not found`);
    }

    if (exception.status !== AttendanceExceptionStatus.PENDING) {
      throw new BadRequestException(`Correction request is already resolved (Status: ${exception.status})`);
    }

    if (exception.employeeId === approverEmployeeId) {
      throw new ForbiddenException('You cannot approve or reject your own correction request');
    }

    const employee = exception.employee;

    // Manager/Admin approval chain validation
    if (approverType !== 'super_admin' && approverType !== 'client_admin') {
      if (employee.managerId !== approverEmployeeId) {
        throw new ForbiddenException('Only the designated manager or an admin can approve this correction request');
      }
    }

    const timezone = employee.branch?.timezone || 'Asia/Kolkata';

    const proposedCheckIn = exception.metadata?.proposedCheckInTime ? new Date(exception.metadata.proposedCheckInTime) : null;
    const proposedCheckOut = exception.metadata?.proposedCheckOutTime ? new Date(exception.metadata.proposedCheckOutTime) : null;
    const requestDateStr = exception.metadata?.date || 
      exception.createdAt.toLocaleDateString('en-CA', { timeZone: timezone });

    const t = await this.recordModel.sequelize!.transaction();

    try {
      console.log("BEFORE record fetch");
      let record = await this.recordModel.findOne({
        where: { employeeId: employee.id, date: requestDateStr },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      console.log("AFTER record fetch");

      if (record && record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }

      // Fetch policy
      const policy = await this.policyModel.findOne({ where: { companyId }, transaction: t });

      // Resolve Shift details
      const shiftId = record?.shiftId || employee.shiftId;
      let shift: any = null;
      if (shiftId) {
        shift = await this.shiftModel.findOne({ where: { id: shiftId, companyId }, transaction: t });
      }

      if (!shift) {
        shift = {
          startTime: policy?.defaultShiftStartTime || '09:00',
          endTime: policy?.defaultShiftEndTime || '18:00',
          breakMinutes: 60,
          gracePeriodMinutes: policy?.lateComingGraceMinutes || 15,
          weeklyOffDays: policy?.weeklyOffDays || [0, 6],
        };
      }

      // Calculations
      let lateMinutes = 0;
      let totalHours = 0;
      let overtimeHours = 0;

      const finalCheckIn = proposedCheckIn || (record ? (record.checkInTime ? new Date(record.checkInTime) : null) : null);
      const finalCheckOut = proposedCheckOut || (record ? (record.checkOutTime ? new Date(record.checkOutTime) : null) : null);

      if (finalCheckIn) {
        const checkInTimeStr = finalCheckIn.toLocaleTimeString('en-US', { hour12: false, timeZone: timezone });
        const [inH, inM] = checkInTimeStr.split(':').map(Number);
        lateMinutes = this.calculateLateMinutes(inH * 60 + inM, shift.startTime, shift.gracePeriodMinutes);
      }

      if (finalCheckIn && finalCheckOut) {
        // Calculate actual break duration from logs instead of shift default
        let breakDurationMs = 0;
        if (record && record.id) {
          const logs = await this.logModel.findAll({
            where: { attendanceRecordId: record.id },
            order: [['timestamp', 'ASC']],
            transaction: t,
          });
          let breakStart: Date | null = null;
          for (const log of logs) {
            if (log.actionType === AttendanceActionType.BREAK_START) {
              breakStart = new Date(log.timestamp);
            } else if (log.actionType === AttendanceActionType.BREAK_END && breakStart) {
              breakDurationMs += log.timestamp.getTime() - breakStart.getTime();
              breakStart = null;
            }
          }
          if (breakStart && finalCheckOut.getTime() > breakStart.getTime()) {
             breakDurationMs += finalCheckOut.getTime() - breakStart.getTime();
          }
        }

        const breakMinutes = shift.breakMinutes || 0;
        const totalDurationMs = finalCheckOut.getTime() - finalCheckIn.getTime();
        totalHours = Math.max(0, parseFloat(((totalDurationMs - breakDurationMs) / (1000 * 60 * 60)).toFixed(2)));

        // Shift duration for OT
        const [shStart, smStart] = shift.startTime.split(':').map(Number);
        const [shEnd, smEnd] = shift.endTime.split(':').map(Number);
        let shiftDiff = (shEnd * 60 + smEnd) - (shStart * 60 + smStart);
        if (shiftDiff < 0) {
          shiftDiff += 24 * 60;
        }
        const shiftHours = Math.max(0, (shiftDiff - breakMinutes) / 60);

        if (policy?.overtimeAllowed && totalHours > shiftHours) {
          overtimeHours = parseFloat((totalHours - shiftHours).toFixed(2));
        }
      }

      // Determine Status
      const minHoursPresent = policy?.minHoursForPresent !== undefined ? Number(policy.minHoursForPresent) : 8;
      const minHoursHalfDay = policy?.minHoursForHalfDay !== undefined ? Number(policy.minHoursForHalfDay) : 4;
      let finalStatus = record ? record.attendanceStatus : AttendanceStatus.PRESENT;

      if (finalCheckIn && !finalCheckOut) {
        finalStatus = lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
      } else if (finalCheckIn && finalCheckOut) {
        if (totalHours < minHoursHalfDay) {
          finalStatus = AttendanceStatus.ABSENT;
        } else if (totalHours < minHoursPresent) {
          finalStatus = AttendanceStatus.HALF_DAY;
        } else if (lateMinutes > 0) {
          finalStatus = AttendanceStatus.LATE;
        } else {
          finalStatus = AttendanceStatus.PRESENT;
        }
      } else {
        finalStatus = AttendanceStatus.ABSENT;
      }

      const stateToSet = finalCheckOut ? AttendanceState.CHECKED_OUT : (finalCheckIn ? AttendanceState.WORKING : AttendanceState.NOT_CHECKED_IN);

      if (!record) {
        record = await this.recordModel.create({
          employeeId: employee.id,
          companyId,
          date: requestDateStr,
          checkInTime: finalCheckIn,
          checkOutTime: finalCheckOut,
          totalHours,
          overtimeHours,
          lateMinutes,
          attendanceStatus: finalStatus,
          attendanceState: stateToSet,
          shiftId: shift.id,
        } as any, { transaction: t });
        await record.reload({ transaction: t });
      } else {
        console.log("BEFORE record.update");
        await record.update({
          checkInTime: finalCheckIn,
          checkOutTime: finalCheckOut,
          totalHours,
          overtimeHours,
          lateMinutes,
          attendanceStatus: finalStatus,
          attendanceState: stateToSet,
          attendanceSource: AttendanceSource.REGULARIZATION_APPROVED,
          shiftId: shift.id,
        }, { transaction: t });
        console.log("AFTER record.update");
        await record.reload({ transaction: t });
        console.log("AFTER record.reload");
      }

      // Update Exception status
      await exception.update({
        status: AttendanceExceptionStatus.APPROVED,
        approvedBy: approverEmployeeId,
        remarks: dto.remarks || 'Approved by Manager/Admin',
        attendanceRecordId: record.id,
      }, { transaction: t });

      // Create correction log
      await this.logModel.create({
        employeeId: employee.id,
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.REGULARIZATION_APPROVED,
        timestamp: new Date(),
        metadata: {
          oldCheckIn: record ? record.checkInTime : null,
          oldCheckOut: record ? record.checkOutTime : null,
          newCheckIn: finalCheckIn,
          newCheckOut: finalCheckOut,
          approvedBy: approverEmployeeId,
          reason: exception.reason,
          remarks: dto.remarks,
        },
      } as any, { transaction: t });

      await t.commit(); // Ensure all DB changes are committed
      console.log("AFTER transaction commit");

      // --- PATCH START ---
      // Fetch a fresh AttendanceRecord after commit to ensure all fields are up-to-date.
      // This resolves stale data issues for returned objects and websocket emissions.
      let freshRecord = null;
      if (record) { // Only fetch if a record was actually created or updated
        freshRecord = await this.recordModel.findByPk(record.id, {
          include: [Employee]
        });
      }
      console.log("AFTER fresh DB query");
      // --- PATCH END ---

      if (!freshRecord) {
         throw new InternalServerErrorException(
            "Failed to fetch updated attendance record after approval"
         );
      }

      this.attendanceGateway.emitAttendanceUpdate(
         "regularization_approved",
         freshRecord
      );

      exception.setDataValue(
         "attendanceRecord",
         freshRecord
      );

      console.log("BEFORE return exception");
      return exception;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // 7. Reject Correction Request
  async rejectCorrection(exceptionId: number, approverEmployeeId: number, approverType: string, dto: ResolveCorrectionDto): Promise<AttendanceException> {
    const exception = await this.exceptionModel.findByPk(exceptionId, {
      include: [{ model: Employee, as: 'employee' }],
    });

    if (!exception) {
      throw new NotFoundException(`Correction request with ID ${exceptionId} not found`);
    }

    if (exception.status !== AttendanceExceptionStatus.PENDING) {
      throw new BadRequestException(`Correction request is already resolved (Status: ${exception.status})`);
    }

    if (exception.employeeId === approverEmployeeId) {
      throw new ForbiddenException('You cannot approve or reject your own correction request');
    }

    const employee = exception.employee;

    if (approverType !== 'super_admin' && approverType !== 'client_admin') {
      if (employee.managerId !== approverEmployeeId) {
        throw new ForbiddenException('Only the designated manager or an admin can reject this correction request');
      }
    }

    if (exception.attendanceRecordId) {
      const record = await this.recordModel.findByPk(exception.attendanceRecordId);
      if (record && record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }
    }

    await exception.update({
      status: AttendanceExceptionStatus.REJECTED,
      approvedBy: approverEmployeeId,
      remarks: dto.remarks || 'Rejected by Manager/Admin',
    });

    if (exception.attendanceRecordId) {
      const record = await this.recordModel.findByPk(exception.attendanceRecordId);
      if (record) {
        try {
          this.attendanceGateway.emitAttendanceUpdate('regularization_rejected', record);
        } catch (err) {
          console.error('Socket emit error in rejectCorrection:', err);
        }
      }
    }

    return exception;
  }



  async getPendingCorrections(companyId: number): Promise<AttendanceException[]> {
    return this.exceptionModel.findAll({
      where: { status: AttendanceExceptionStatus.PENDING },
      include: [
        { 
          model: Employee, 
          as: 'employee', 
          where: { companyId },
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
            { model: Designation, as: 'designation', attributes: ['id', 'name'] }
          ]
        },
        { model: AttendanceRecord, as: 'attendanceRecord' }
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async getRegularizationHistory(companyId: number, query: any): Promise<any> {
    const { page = 1, limit = 10, status, employeeId, search, startDate, endDate, approverId } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    } else {
      whereClause.status = { [Op.in]: [AttendanceExceptionStatus.APPROVED, AttendanceExceptionStatus.REJECTED] };
    }

    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    if (approverId) {
      whereClause.approvedBy = approverId;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = endD;
      }
    }

    const employeeWhere: any = { companyId };
    const userWhere: any = {};
    if (search) {
      userWhere.name = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await this.exceptionModel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'employee',
          where: employeeWhere,
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'], where: search ? userWhere : undefined, required: !!search },
            { model: Designation, as: 'designation', attributes: ['id', 'name'] }
          ]
        },
        {
          model: Employee,
          as: 'approver',
          required: false,
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
            { model: Designation, as: 'designation', attributes: ['id', 'name'] }
          ]
        },
        { model: AttendanceRecord, as: 'attendanceRecord' }
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      totalCount: count,
      page,
      totalPages: Math.ceil(count / limit),
    };
  }

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
      const { todayDateStr, minutesOfDay } = this.getLocalTimeDetails(timezone);

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

  // 11. Assign Shift to Employee
  async assignShift(employeeId: number, companyId: number, shiftId: number): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found in this company workspace');
    }

    const shift = await this.shiftModel.findOne({
      where: { id: shiftId, companyId },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found in this company workspace');
    }

    await employee.update({ shiftId });
    return employee.reload({ include: [Shift] });
  }

  // 12. Manual Override (Admin direct action)
  async manualOverride(
    recordId: number,
    companyId: number,
    adminEmployeeId: number,
    dto: { checkInTime?: string; checkOutTime?: string; attendanceStatus?: AttendanceStatus; lateMinutes?: number; remarks?: string }
  ): Promise<AttendanceRecord> {
    const t = await this.recordModel.sequelize!.transaction();
    try {
      const record = await this.recordModel.findOne({
        where: { id: recordId, companyId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!record) {
        throw new NotFoundException(`Attendance record with ID ${recordId} not found`);
      }

      if (record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }

      if (dto.attendanceStatus === AttendanceStatus.ON_LEAVE || record.attendanceStatus === AttendanceStatus.ON_LEAVE) {
        if (dto.attendanceStatus !== undefined && dto.attendanceStatus !== record.attendanceStatus) {
          throw new BadRequestException('Cannot override ON_LEAVE status directly. Use the manual attendance API to ensure leave balances are updated correctly.');
        }
      }

      const previousRecord = record.toJSON();

      const updateData: any = {};
      if (dto.checkInTime !== undefined) updateData.checkInTime = dto.checkInTime ? new Date(dto.checkInTime) : null;
      if (dto.checkOutTime !== undefined) updateData.checkOutTime = dto.checkOutTime ? new Date(dto.checkOutTime) : null;
      if (dto.attendanceStatus !== undefined) updateData.attendanceStatus = dto.attendanceStatus;
      if (dto.lateMinutes !== undefined) updateData.lateMinutes = dto.lateMinutes;

      const finalCheckIn = dto.checkInTime !== undefined ? (dto.checkInTime ? new Date(dto.checkInTime) : null) : (record.checkInTime ? new Date(record.checkInTime) : null);
      const finalCheckOut = dto.checkOutTime !== undefined ? (dto.checkOutTime ? new Date(dto.checkOutTime) : null) : (record.checkOutTime ? new Date(record.checkOutTime) : null);

      if (finalCheckOut) {
        updateData.attendanceState = AttendanceState.CHECKED_OUT;
      } else if (finalCheckIn) {
        updateData.attendanceState = AttendanceState.WORKING;
      } else {
        updateData.attendanceState = AttendanceState.NOT_CHECKED_IN;
      }

      if (finalCheckIn && finalCheckOut) {
        let breakMinutes = 60;
        if (record.shiftId) {
          const shift = await this.shiftModel.findByPk(record.shiftId, { transaction: t });
          if (shift) breakMinutes = shift.breakMinutes;
        }
        const totalDurationMs = finalCheckOut.getTime() - finalCheckIn.getTime();
        updateData.totalHours = Math.max(0, parseFloat(((totalDurationMs - (breakMinutes * 60 * 1000)) / (1000 * 60 * 60)).toFixed(2)));
      } else {
        updateData.totalHours = 0;
        updateData.overtimeHours = 0;
      }

      await record.update(updateData, { transaction: t });

      // Create manual override log
      await this.logModel.create({
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.AUTO_CORRECTION,
        timestamp: new Date(),
        metadata: {
          overriddenBy: adminEmployeeId,
          remarks: dto.remarks || 'Manual admin override',
          previousRecord,
          newRecord: record.toJSON(),
        },
      } as any, { transaction: t });

      await t.commit();

      try {
        this.attendanceGateway.emitAttendanceUpdate('manual_override', record);
      } catch (err) {
        console.error('Socket emit error in manualOverride:', err);
      }

      return record;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // Admin fallback helper
  async getFallbackEmployeeIdForAdmin(companyId: number): Promise<number | null> {
    const employee = await this.employeeModel.findOne({
      where: { companyId },
      order: [['id', 'ASC']],
    });
    return employee ? employee.id : null;
  }

  // 13. Admin Manual Attendance Entry
  async manualAttendance(
    companyId: number,
    adminEmployeeId: number,
    dto: { employeeId: number; date: string; checkInTime?: string; checkOutTime?: string; status: AttendanceStatus; leaveTypeId?: number; reason?: string }
  ): Promise<AttendanceRecord> {
    const employee = await this.employeeModel.findOne({
      where: { id: dto.employeeId, companyId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee not found`);
    }

    if (dto.status === AttendanceStatus.ON_LEAVE && !dto.leaveTypeId) {
      throw new BadRequestException('leaveTypeId is mandatory when marking attendance as LEAVE');
    }

    const t = await this.recordModel.sequelize!.transaction();
    try {
      let record = await this.recordModel.findOne({
        where: { employeeId: dto.employeeId, date: dto.date, companyId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (record && record.isPayrollLocked) {
        throw new ForbiddenException('Attendance locked after payroll processing');
      }

      const previousRecord = record ? record.toJSON() : null;
      const year = new Date(dto.date).getFullYear();

      // Case A: Refund previous ON_LEAVE balance if old status was ON_LEAVE and new status is different (or new status is ON_LEAVE but leave type changed)
      if (previousRecord && previousRecord.attendanceStatus === AttendanceStatus.ON_LEAVE) {
        if (dto.status !== AttendanceStatus.ON_LEAVE || dto.leaveTypeId !== undefined) {
          const logs = await this.logModel.findAll({
            where: {
              attendanceRecordId: record!.id,
              actionType: { [Op.in]: [AttendanceActionType.ADMIN_MARKED, AttendanceActionType.AUTO_CORRECTION] },
            },
            order: [['id', 'DESC']],
            transaction: t,
          });

          let oldLeaveTypeId = null;
          for (const l of logs) {
            if (l.metadata && l.metadata.leaveTypeId !== undefined) {
              oldLeaveTypeId = l.metadata.leaveTypeId;
              break;
            }
          }

          if (oldLeaveTypeId) {
            const oldBalance = await this.employeeLeaveBalanceModel.findOne({
              where: { employeeId: dto.employeeId, leaveTypeId: oldLeaveTypeId, year },
              transaction: t,
              lock: t.LOCK.UPDATE,
            });
            if (oldBalance) {
              await oldBalance.update({
                remainingDays: Number(oldBalance.remainingDays) + 1,
                usedDays: Math.max(0, Number(oldBalance.usedDays) - 1),
              }, { transaction: t });
            }
          }
        }
      }

      // Case B: Deduct leave balance if new status is ON_LEAVE
      if (dto.status === AttendanceStatus.ON_LEAVE) {
        const leaveType = await this.leaveTypeModel.findOne({
          where: { id: dto.leaveTypeId, companyId, isActive: true },
          transaction: t,
        });
        if (!leaveType) {
          throw new NotFoundException('Leave type not found or inactive');
        }

        let balance = await this.employeeLeaveBalanceModel.findOne({
          where: { employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!balance) {
          const joinDate = new Date(employee.joiningDate || new Date());
          const joinedMonth = joinDate.getFullYear() === year ? joinDate.getMonth() : 0;
          const remainingMonths = 12 - joinedMonth;
          const proratedDays = parseFloat(((leaveType.daysPerYear / 12) * remainingMonths).toFixed(2));
          
          balance = await this.employeeLeaveBalanceModel.create({
            companyId,
            employeeId: dto.employeeId,
            leaveTypeId: dto.leaveTypeId,
            year,
            totalAllocated: proratedDays,
            remainingDays: proratedDays,
            usedDays: 0,
            pendingDays: 0,
            carryForwardDays: 0,
          } as any, { transaction: t });
        }

        if (balance.remainingDays < 1) {
          throw new BadRequestException(`Insufficient leave balance. Required: 1, Remaining: ${balance.remainingDays}`);
        }

        await balance.update({
          remainingDays: Number(balance.remainingDays) - 1,
          usedDays: Number(balance.usedDays) + 1,
        }, { transaction: t });
      }

      let finalCheckIn = dto.checkInTime ? new Date(dto.checkInTime) : null;
      let finalCheckOut = dto.checkOutTime ? new Date(dto.checkOutTime) : null;
      
      let totalHours = 0;
      if (finalCheckIn && finalCheckOut) {
        const totalDurationMs = finalCheckOut.getTime() - finalCheckIn.getTime();
        totalHours = Math.max(0, parseFloat((totalDurationMs / (1000 * 60 * 60)).toFixed(2)));
      }

      if (!record) {
        record = await this.recordModel.create({
          employeeId: dto.employeeId,
          companyId,
          date: dto.date,
          checkInTime: finalCheckIn,
          checkOutTime: finalCheckOut,
          totalHours,
          attendanceStatus: dto.status,
          attendanceState: AttendanceState.CHECKED_OUT,
          attendanceSource: AttendanceSource.ADMIN_MARKED,
          shiftId: employee.shiftId,
        } as any, { transaction: t });
      } else {
        await record.update({
          checkInTime: finalCheckIn,
          checkOutTime: finalCheckOut,
          totalHours,
          attendanceStatus: dto.status,
          attendanceState: AttendanceState.CHECKED_OUT,
          attendanceSource: AttendanceSource.ADMIN_MARKED,
        }, { transaction: t });
      }

      await this.logModel.create({
        employeeId: dto.employeeId,
        attendanceRecordId: record.id,
        actionType: AttendanceActionType.ADMIN_MARKED,
        timestamp: new Date(),
        metadata: {
          changedBy: adminEmployeeId,
          oldValue: previousRecord,
          newValue: record.toJSON(),
          reason: dto.reason || 'Manual Admin Entry',
          leaveTypeId: dto.status === AttendanceStatus.ON_LEAVE ? dto.leaveTypeId : null,
        },
      } as any, { transaction: t });

      await t.commit();

      try {
        this.attendanceGateway.emitAttendanceUpdate('manual_attendance', record);
      } catch (err) {
        console.error('Socket emit error in manualAttendance:', err);
      }

      return record;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
