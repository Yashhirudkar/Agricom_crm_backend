import { Injectable, PreconditionFailedException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceStatus, AttendanceState } from '../models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../models/attendance-log.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Shift } from '../models/shift.model';
import { Op, Transaction } from 'sequelize';

export interface CalculatedWorkingHours {
  grossWorkingMs: number;
  breakDurationMs: number;
  netWorkingMs: number;
  grossWorkingHours: number;
  netWorkingHours: number;
  effectiveWorkingMinutes: number;
}

export interface CheckInWindowEvaluation {
  windowStatus: AttendanceStatus;
  lateMinutes: number;
  isLate: boolean;
}

export interface EnterpriseAttendanceEvaluation {
  attendanceStatus: AttendanceStatus;
  attendanceState?: AttendanceState;
  grossWorkingHours: number;
  netWorkingHours: number;
  effectiveWorkingMinutes: number;
  breakDurationMs: number;
  lateMinutes: number;
  isLate: boolean;
  monthlyLateCount: number;
  isEarlyExit: boolean;
  earlyExitMinutes: number;
  isOvertime: boolean;
  overtimeHours: number;
  isMissedCheckout: boolean;
}

export interface PolicyPreviewResult {
  isConfigured: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  graceStart: string | null;
  graceEnd: string | null;
  lateWindowStart: string | null;
  lateWindowEnd: string | null;
  halfDayStart: string | null;
  halfDayEnd: string | null;
  absentAfter: string | null;
  grossShiftHours: number | null;
  netWorkingHours: number | null;
  requiredWorkingHours: number | null;
  monthlyLateThreshold: number | null;
  latePenaltyAction: string | null;
  breakMinutes: number | null;
  checkoutGraceMinutes: number | null;
  weeklyOffDays: number[];
}

@Injectable()
export class AttendancePolicyEngineService {
  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
  ) {}

  /**
   * Retrieves the current Company HR Policy for attendance calculations and displays.
   */
  public async getCompanyPolicy(companyId: number): Promise<CompanyHrPolicy> {
    const policy = await this.policyModel.findOne({ where: { companyId } });
    if (!policy) {
      throw new NotFoundException(
        `Company HR Policy is not configured for company ID ${companyId}. Please configure HR Policy in settings.`,
      );
    }
    return policy;
  }

  /**
   * Generates pure policy preview calculations for frontend display without duplicating business logic.
   */
  public generatePolicyPreview(dto: any): PolicyPreviewResult {
    if (!dto || !dto.defaultShiftStartTime || !dto.defaultShiftEndTime) {
      return {
        isConfigured: false,
        shiftStart: null,
        shiftEnd: null,
        graceStart: null,
        graceEnd: null,
        lateWindowStart: null,
        lateWindowEnd: null,
        halfDayStart: null,
        halfDayEnd: null,
        absentAfter: null,
        grossShiftHours: null,
        netWorkingHours: null,
        requiredWorkingHours: null,
        monthlyLateThreshold: null,
        latePenaltyAction: null,
        breakMinutes: null,
        checkoutGraceMinutes: null,
        weeklyOffDays: [],
      };
    }

    const shiftStart = dto.defaultShiftStartTime;
    const shiftEnd = dto.defaultShiftEndTime;

    const shiftStartMins = this.timeStrToMinutes(shiftStart, '00:00');
    const shiftEndMins = this.timeStrToMinutes(shiftEnd, '00:00');

    let shiftDiffMins = shiftEndMins - shiftStartMins;
    if (shiftDiffMins < 0) shiftDiffMins += 24 * 60;
    const grossShiftHours = parseFloat((shiftDiffMins / 60).toFixed(2));

    let breakMins =
      dto.defaultBreakMinutes !== undefined &&
      dto.defaultBreakMinutes !== null &&
      dto.defaultBreakMinutes !== ''
        ? Number(dto.defaultBreakMinutes)
        : null;

    if (dto.defaultBreakStartTime && dto.defaultBreakEndTime) {
      const bStart = this.timeStrToMinutes(dto.defaultBreakStartTime, '00:00');
      const bEnd = this.timeStrToMinutes(dto.defaultBreakEndTime, '00:00');
      if (bEnd > bStart) {
        breakMins = bEnd - bStart;
      }
    }

    const netWorkingMins = Math.max(0, shiftDiffMins - (breakMins || 0));
    const netWorkingHours = parseFloat((netWorkingMins / 60).toFixed(2));

    const rawGrace =
      dto.lateComingGraceMinutes !== undefined && dto.lateComingGraceMinutes !== null && dto.lateComingGraceMinutes !== ''
        ? dto.lateComingGraceMinutes
        : dto.lateMarkGraceMinutes;

    const graceMins =
      rawGrace !== undefined && rawGrace !== null && rawGrace !== ''
        ? Number(rawGrace)
        : 0;

    const graceEndTotalMins = (shiftStartMins + graceMins) % (24 * 60);
    const gH = Math.floor(graceEndTotalMins / 60);
    const gM = graceEndTotalMins % 60;
    const graceEnd = `${String(gH).padStart(2, '0')}:${String(gM).padStart(2, '0')}`;

    const graceStart = shiftStart;

    const lateStartMins = (graceEndTotalMins + 1) % (24 * 60);
    const lSH = Math.floor(lateStartMins / 60);
    const lSM = lateStartMins % 60;
    const lateWindowStart = `${String(lSH).padStart(2, '0')}:${String(lSM).padStart(2, '0')}`;

    const halfDayStart = dto.halfDayAfterTime || null;
    const absentAfter = dto.absentAfterTime || null;

    let lateWindowEnd: string | null = null;
    if (halfDayStart) {
      const hStartMins = this.timeStrToMinutes(halfDayStart, '00:00');
      const lEMins = (hStartMins - 1 + 24 * 60) % (24 * 60);
      const lEH = Math.floor(lEMins / 60);
      const lEM = lEMins % 60;
      lateWindowEnd = `${String(lEH).padStart(2, '0')}:${String(lEM).padStart(2, '0')}`;
    }

    let halfDayEnd: string | null = null;
    if (absentAfter) {
      const aStartMins = this.timeStrToMinutes(absentAfter, '00:00');
      const hEMins = (aStartMins - 1 + 24 * 60) % (24 * 60);
      const hEH = Math.floor(hEMins / 60);
      const hEM = hEMins % 60;
      halfDayEnd = `${String(hEH).padStart(2, '0')}:${String(hEM).padStart(2, '0')}`;
    }

    const rawReqHours =
      dto.minHoursForPresent !== undefined && dto.minHoursForPresent !== null && dto.minHoursForPresent !== ''
        ? dto.minHoursForPresent
        : dto.minFullDayHours;

    return {
      isConfigured: true,
      shiftStart,
      shiftEnd,
      graceStart,
      graceEnd,
      lateWindowStart,
      lateWindowEnd,
      halfDayStart,
      halfDayEnd,
      absentAfter,
      grossShiftHours,
      netWorkingHours,
      requiredWorkingHours:
        rawReqHours !== undefined && rawReqHours !== null && rawReqHours !== ''
          ? Number(rawReqHours)
          : null,
      monthlyLateThreshold:
        dto.monthlyLateThreshold !== undefined &&
        dto.monthlyLateThreshold !== null &&
        dto.monthlyLateThreshold !== ''
          ? Number(dto.monthlyLateThreshold)
          : null,
      latePenaltyAction: dto.latePenaltyAction || null,
      breakMinutes: breakMins,
      checkoutGraceMinutes:
        dto.checkoutGraceMinutes !== undefined &&
        dto.checkoutGraceMinutes !== null &&
        dto.checkoutGraceMinutes !== ''
          ? Number(dto.checkoutGraceMinutes)
          : null,
      weeklyOffDays: Array.isArray(dto.weeklyOffDays) ? dto.weeklyOffDays : [],
    };
  }

  /**
   * Utility to convert time string ("09:30" / "09:30:00" / "18:00") to total minutes from midnight
   */
  public timeStrToMinutes(timeStr?: string, defaultStr = '00:00'): number {
    const target = timeStr || defaultStr;
    if (!target || !target.includes(':')) return 0;
    const parts = target.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  /**
   * 1. Calculate Gross Working Hours, Break Duration, Net Working Hours, and Effective Minutes
   */
  public calculateWorkingHours(
    checkInTime: Date | string | null,
    checkOutTime: Date | string | null,
    shift: any,
    policy: CompanyHrPolicy | null,
    logs: AttendanceLog[] = [],
  ): CalculatedWorkingHours {
    if (!checkInTime) {
      return {
        grossWorkingMs: 0,
        breakDurationMs: 0,
        netWorkingMs: 0,
        grossWorkingHours: 0,
        netWorkingHours: 0,
        effectiveWorkingMinutes: 0,
      };
    }

    const startMs = new Date(checkInTime).getTime();
    const endMs = checkOutTime ? new Date(checkOutTime).getTime() : Date.now();
    const grossWorkingMs = Math.max(0, endMs - startMs);

    // Calculate Break Duration
    let breakDurationMs = 0;
    let breakLogsExist = false;

    if (logs && logs.length > 0) {
      const sortedLogs = [...logs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      let currentBreakStartMs: number | null = null;
      for (const log of sortedLogs) {
        if (log.actionType === AttendanceActionType.BREAK_START) {
          currentBreakStartMs = new Date(log.timestamp).getTime();
          breakLogsExist = true;
        } else if (
          log.actionType === AttendanceActionType.BREAK_END &&
          currentBreakStartMs !== null
        ) {
          const breakEndMs = new Date(log.timestamp).getTime();
          if (breakEndMs > currentBreakStartMs) {
            breakDurationMs += breakEndMs - currentBreakStartMs;
          }
          currentBreakStartMs = null;
          breakLogsExist = true;
        }
      }
    }

    // Default break deduction if no break logs exist and checkIn is at/before break start
    if (!breakLogsExist) {
      const defaultBreakMins = shift?.breakMinutes ?? (policy?.defaultBreakMinutes ?? 0);
      const breakStartStr = policy?.defaultBreakStartTime;
      const checkInObj = new Date(checkInTime);
      const checkInMins = checkInObj.getHours() * 60 + checkInObj.getMinutes();
      const breakStartMins = this.timeStrToMinutes(breakStartStr, '00:00');

      if (breakStartStr && checkInMins <= breakStartMins) {
        breakDurationMs = (defaultBreakMins || 0) * 60 * 1000;
      } else {
        breakDurationMs = 0;
      }
    }

    const netWorkingMs = Math.max(0, grossWorkingMs - breakDurationMs);
    const grossWorkingHours = parseFloat((grossWorkingMs / (1000 * 60 * 60)).toFixed(2));
    const netWorkingHours = parseFloat((netWorkingMs / (1000 * 60 * 60)).toFixed(2));

    const checkoutGraceMinutes = policy?.checkoutGraceMinutes ?? 0;
    const netWorkingMinutes = Math.round(netWorkingMs / (1000 * 60));
    const effectiveWorkingMinutes = netWorkingMinutes + checkoutGraceMinutes;

    return {
      grossWorkingMs,
      breakDurationMs,
      netWorkingMs,
      grossWorkingHours,
      netWorkingHours,
      effectiveWorkingMinutes,
    };
  }

  /**
   * 2. Evaluate Check-In Window (Grace, Late Window, Half Day Window, Absent Window)
   */
  public evaluateCheckInWindow(
    checkInTime: Date | string,
    shiftStartTimeStr?: string,
    graceMinutes = 0,
    halfDayAfterTimeStr?: string,
    absentAfterTimeStr?: string,
    timezone = 'Asia/Kolkata',
  ): CheckInWindowEvaluation {
    const inDate = new Date(checkInTime);
    const localTimeStr = inDate.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: timezone,
    });
    const [inH, inM] = localTimeStr.split(':').map(Number);
    const checkInMinutes = inH * 60 + inM;

    const shiftStartMinutes = this.timeStrToMinutes(shiftStartTimeStr, '00:00');
    const halfDayAfterMinutes = halfDayAfterTimeStr ? this.timeStrToMinutes(halfDayAfterTimeStr, '00:00') : Infinity;
    const absentAfterMinutes = absentAfterTimeStr ? this.timeStrToMinutes(absentAfterTimeStr, '00:00') : Infinity;

    if (checkInMinutes <= shiftStartMinutes + graceMinutes) {
      return {
        windowStatus: AttendanceStatus.PRESENT,
        lateMinutes: 0,
        isLate: false,
      };
    }

    const lateMinutes = checkInMinutes - shiftStartMinutes;

    if (checkInMinutes < halfDayAfterMinutes) {
      return {
        windowStatus: AttendanceStatus.PRESENT,
        lateMinutes,
        isLate: true,
      };
    }

    if (checkInMinutes < absentAfterMinutes) {
      return {
        windowStatus: AttendanceStatus.HALF_DAY,
        lateMinutes,
        isLate: true,
      };
    }

    return {
      windowStatus: AttendanceStatus.ABSENT,
      lateMinutes,
      isLate: true,
    };
  }

  /**
   * 3. Count Prior Late Arrivals in the Current Month (before dateStr)
   */
  public async getMonthlyLateCount(
    employeeId: number,
    dateStr: string,
    transaction?: Transaction,
  ): Promise<number> {
    const [year, month] = dateStr.split('-').map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;

    const lateRecords = await this.recordModel.count({
      where: {
        employeeId,
        date: {
          [Op.gte]: startOfMonth,
          [Op.lt]: dateStr,
        },
        lateMinutes: {
          [Op.gt]: 0,
        },
      },
      transaction,
    });

    return lateRecords;
  }

  /**
   * 4. Full Enterprise Policy Evaluation
   */
  public async evaluateAttendanceStatus(
    employeeId: number,
    companyId: number,
    dateStr: string,
    checkInTime: Date | string | null,
    checkOutTime: Date | string | null,
    shift: any,
    policy: CompanyHrPolicy | null,
    logs: AttendanceLog[] = [],
    timezone = 'Asia/Kolkata',
    transaction?: Transaction,
  ): Promise<EnterpriseAttendanceEvaluation> {
    if (!policy && !shift) {
      throw new PreconditionFailedException(
        `Company HR Policy is not configured for company ID ${companyId}. Please configure HR Policy in settings.`,
      );
    }

    const shiftStartTimeStr = shift?.startTime || policy?.defaultShiftStartTime;
    const shiftEndTimeStr = shift?.endTime || policy?.defaultShiftEndTime;
    const graceMinutes = shift?.gracePeriodMinutes ?? (policy?.lateComingGraceMinutes ?? 0);
    const halfDayAfterTimeStr = policy?.halfDayAfterTime;
    const absentAfterTimeStr = policy?.absentAfterTime;

    let windowStatus = AttendanceStatus.PRESENT;
    let lateMinutes = 0;
    let isLate = false;
    let monthlyLateCount = 0;

    if (checkInTime) {
      const windowEval = this.evaluateCheckInWindow(
        checkInTime,
        shiftStartTimeStr,
        graceMinutes,
        halfDayAfterTimeStr,
        absentAfterTimeStr,
        timezone,
      );
      lateMinutes = windowEval.lateMinutes;
      isLate = windowEval.isLate;

      if (isLate) {
        const priorLateCount = await this.getMonthlyLateCount(
          employeeId,
          dateStr,
          transaction,
        );
        monthlyLateCount = priorLateCount + 1;
        const monthlyLateThreshold = policy?.monthlyLateThreshold ?? 0;

        if (monthlyLateThreshold > 0 && monthlyLateCount > monthlyLateThreshold) {
          windowStatus = AttendanceStatus.HALF_DAY;
        } else {
          windowStatus = windowEval.windowStatus;
        }
      } else {
        windowStatus = windowEval.windowStatus;
      }
    }

    const workingHoursInfo = this.calculateWorkingHours(
      checkInTime,
      checkOutTime,
      shift,
      policy,
      logs,
    );

    let finalStatus = windowStatus;
    let earlyExitMinutes = 0;
    let isEarlyExit = false;
    let isOvertime = false;
    let overtimeHours = 0;
    let isMissedCheckout = false;

    if (checkInTime && checkOutTime) {
      const minHoursPresent = policy?.minHoursForPresent !== undefined ? Number(policy.minHoursForPresent) : 0;
      const minHoursHalfDay = policy?.minHoursForHalfDay !== undefined ? Number(policy.minHoursForHalfDay) : 0;
      const requiredNetMinutes = Math.round(minHoursPresent * 60);
      const requiredHalfDayMinutes = Math.round(minHoursHalfDay * 60);

      const effectiveMinutes = workingHoursInfo.effectiveWorkingMinutes;

      if (requiredHalfDayMinutes > 0 && effectiveMinutes < requiredHalfDayMinutes) {
        finalStatus = AttendanceStatus.ABSENT;
      } else if (requiredNetMinutes > 0 && effectiveMinutes < requiredNetMinutes) {
        finalStatus = AttendanceStatus.HALF_DAY;
      } else {
        finalStatus = windowStatus;
      }

      // Early exit calculation
      const outDate = new Date(checkOutTime);
      const outLocalStr = outDate.toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: timezone,
      });
      const [outH, outM] = outLocalStr.split(':').map(Number);
      const checkOutMinutes = outH * 60 + outM;
      const shiftEndMinutes = this.timeStrToMinutes(shiftEndTimeStr, '00:00');
      const checkoutGrace = policy?.checkoutGraceMinutes ?? 0;

      if (shiftEndTimeStr && checkOutMinutes < shiftEndMinutes - checkoutGrace) {
        isEarlyExit = true;
        earlyExitMinutes = shiftEndMinutes - checkOutMinutes;
      }

      // Shift duration for Overtime
      const shiftStartMinutes = this.timeStrToMinutes(shiftStartTimeStr, '00:00');
      let shiftDiff = shiftEndMinutes - shiftStartMinutes;
      if (shiftDiff < 0) shiftDiff += 24 * 60;
      const breakMins = shift?.breakMinutes ?? (policy?.defaultBreakMinutes ?? 0);
      const shiftHours = Math.max(0, (shiftDiff - breakMins) / 60);

      const otStartAfterHours = (policy?.overtimeStartAfter || 0) / 60;
      const otThreshold = shiftHours + otStartAfterHours;

      if (policy?.overtimeAllowed && workingHoursInfo.netWorkingHours > otThreshold) {
        isOvertime = true;
        overtimeHours = parseFloat(
          (workingHoursInfo.netWorkingHours - shiftHours).toFixed(2),
        );
      }
    } else if (checkInTime && !checkOutTime) {
      const autoCheckoutTimeStr = policy?.autoCheckoutTime;
      const autoCheckoutMins = this.timeStrToMinutes(autoCheckoutTimeStr, '23:59');
      const now = new Date();
      const nowLocalStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: timezone,
      });
      const [nowH, nowM] = nowLocalStr.split(':').map(Number);
      const nowMins = nowH * 60 + nowM;

      const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
      if (dateStr < todayStr || (dateStr === todayStr && nowMins >= autoCheckoutMins)) {
        isMissedCheckout = true;
      }
    }

    return {
      attendanceStatus: finalStatus,
      lateMinutes,
      earlyExitMinutes,
      isLate,
      isEarlyExit,
      isMissedCheckout,
      isOvertime,
      grossWorkingHours: workingHoursInfo.grossWorkingHours,
      netWorkingHours: workingHoursInfo.netWorkingHours,
      effectiveWorkingMinutes: workingHoursInfo.effectiveWorkingMinutes,
      breakDurationMs: workingHoursInfo.breakDurationMs,
      overtimeHours,
      monthlyLateCount,
    };
  }
}
