import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { BiometricDevice } from '../models/biometric-device.model';
import { AttendanceRecord, AttendanceState, AttendanceSource } from '../../attendance/models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../../attendance/models/attendance-log.model';
import { AttendanceAuditTrail } from '../../attendance/models/attendance-audit-trail.model';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Shift } from '../../attendance/models/shift.model';
import { AttendanceHelperService } from '../../attendance/services/attendance-helper.service';
import { AttendancePolicyEngineService } from '../../attendance/services/attendance-policy-engine.service';
import { AttendanceSummaryService } from '../../attendance/services/attendance-summary.service';
import { AttendanceGateway } from '../../attendance/gateways/attendance.gateway';
import { Op } from 'sequelize';

@Injectable()
export class BiometricQueueService {
  private readonly logger = new Logger(BiometricQueueService.name);
  private isProcessing = false;

  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(AttendanceLog)
    private readonly logModel: typeof AttendanceLog,
    @InjectModel(AttendanceAuditTrail)
    private readonly auditTrailModel: typeof AttendanceAuditTrail,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
    private readonly helperService: AttendanceHelperService,
    private readonly policyEngine: AttendancePolicyEngineService,
    private readonly summaryService: AttendanceSummaryService,
    private readonly attendanceGateway: AttendanceGateway,
  ) {}

  // 1. Triggered on Event
  @OnEvent('biometric.v1.punch.received')
  async handlePunchReceivedEvent(payload: { companyId: number; deviceSerialNumber: string }) {
    this.logger.log(`Punch received event caught. Processing queue for company ${payload.companyId}...`);
    this.processQueue(payload.companyId);
  }

  // 2. Triggered on Cron (every 15 seconds)
  @Cron('*/15 * * * * *')
  async handleCronQueueProcess() {
    if (this.isProcessing) return;
    await this.processQueue();
  }

  // 3. Heartbeat checker cron (runs every 1 minute)
  @Cron('0 */1 * * * *')
  async checkDevicesHeartbeat() {
    const t = await this.deviceModel.sequelize.transaction();
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Update ONLINE active devices with no heartbeat in past 5 minutes to OFFLINE
      // (Skips devices that are in maintenance mode)
      const [updatedCount] = await this.deviceModel.update(
        { status: 'OFFLINE' as any },
        {
          where: {
            status: 'ONLINE' as any,
            isActive: true,
            maintenanceMode: false,
            lastHeartbeat: {
              [Op.or]: [
                { [Op.lt]: fiveMinutesAgo },
                { [Op.eq]: null },
              ],
            },
          },
          transaction: t,
        },
      );

      if (updatedCount > 0) {
        this.logger.warn(`Heartbeat Checker: Marked ${updatedCount} inactive biometric devices as OFFLINE.`);
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      this.logger.error('Error in checkDevicesHeartbeat cron:', err);
    }
  }

  // 4. Process Pending Queue
  async processQueue(companyId?: number) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find rows that are pending or failed, but ready for retry (nextRetryAt <= NOW)
      const whereClause: any = {
        [Op.or]: [
          { status: BiometricPunchStatus.PENDING },
          {
            status: BiometricPunchStatus.FAILED,
            retryCount: { [Op.lt]: 5 },
            nextRetryAt: { [Op.lte]: new Date() },
          },
        ],
      };
      if (companyId) {
        whereClause.companyId = companyId;
      }

      // Start transaction for row locking
      const queryTx = await this.punchLogModel.sequelize.transaction();

      let pendingPunches: BiometricPunchLog[] = [];
      try {
        // Fetch punches sorted by priority (HIGH first), then timestamp
        // Protects against worker race conditions with row locking and SKIP LOCKED
        pendingPunches = await this.punchLogModel.findAll({
          where: whereClause,
          order: [
            ['priority', 'DESC'],
            ['timestamp', 'ASC'],
          ],
          limit: 100,
          lock: queryTx.LOCK.UPDATE,
          skipLocked: true,
          transaction: queryTx,
        });

        // Set status to PROCESSING under the lock transaction
        if (pendingPunches.length > 0) {
          const ids = pendingPunches.map(p => p.id);
          await this.punchLogModel.update(
            { status: BiometricPunchStatus.PROCESSING },
            { where: { id: ids }, transaction: queryTx }
          );
        }

        await queryTx.commit();
      } catch (queryErr) {
        await queryTx.rollback();
        throw queryErr;
      }

      if (pendingPunches.length === 0) {
        this.isProcessing = false;
        return;
      }

      this.logger.log(`Processing ${pendingPunches.length} locked biometric punches...`);

      for (const punch of pendingPunches) {
        await this.processSinglePunch(punch);
      }
    } catch (err) {
      this.logger.error('Error processing biometric punches queue:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSinglePunch(punch: BiometricPunchLog) {
    const t = await this.punchLogModel.sequelize.transaction();

    try {
      // 1. Fetch Device Config
      const device = await this.deviceModel.findOne({
        where: { serialNumber: punch.deviceSerialNumber, deletedAt: null },
        transaction: t,
      });

      if (!device) {
        throw new Error(`Device serial ${punch.deviceSerialNumber} not found or soft-deleted`);
      }

      // If device is in maintenance mode, punches can still process, but we log a warning
      if (device.maintenanceMode) {
        this.logger.warn(`Ingesting punch from device ${device.serialNumber} which is currently in MAINTENANCE mode`);
      }

      // 2. Fetch Company Policy and check if biometric enabled
      const policy = await this.policyModel.findOne({
        where: { companyId: punch.companyId },
        transaction: t,
      });

      if (!policy || !policy.biometricEnabled) {
        throw new Error('Biometric attendance is not enabled in HR policy for this company');
      }

      // 3. Resolve Employee by employeeCode directly (User ID from device)
      const employee = await this.employeeModel.findOne({
        where: {
          companyId: punch.companyId,
          employeeCode: punch.biometricUserId.trim(),
        },
        transaction: t,
      });

      if (!employee) {
        // Unknown user - update state but do not roll back transaction (graceful fallback)
        await punch.update({
          status: BiometricPunchStatus.UNKNOWN_USER,
          processedTime: new Date(),
        }, { transaction: t });
        await t.commit();
        this.logger.warn(`Biometric User ID ${punch.biometricUserId} could not be resolved to an employee.`);
        return;
      }

      // If employee is resigned or terminated, reject punch
      if (
        employee.status === EmployeeStatus.RESIGNED ||
        employee.status === EmployeeStatus.TERMINATED
      ) {
        throw new Error(`Employee status is ${employee.status}. Punches rejected.`);
      }

      // 4. Apply Time Drift Correction
      const correctedMs = new Date(punch.timestamp).getTime() + (device.timeOffset * 60 * 1000);
      const correctedTimestamp = new Date(correctedMs);

      // 5. Localise dateStr based on Employee's Branch Timezone
      const timezone = employee.branch?.timezone || 'Asia/Kolkata';
      const localDetails = this.helperService.getLocalTimeDetails(timezone, correctedTimestamp);
      const targetDateStr = localDetails.todayDateStr;

      // 6. Look for active daily AttendanceRecord (using write lock for transaction safety)
      let record = await this.recordModel.findOne({
        where: { employeeId: employee.id, date: targetDateStr },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      // 7. Night Shift crossover boundary check
      if (!record || record.checkOutTime) {
        const yesterdayDate = new Date(correctedTimestamp);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const { todayDateStr: yesterdayDateStr } = this.helperService.getLocalTimeDetails(timezone, yesterdayDate);

        const yesterdayRecord = await this.recordModel.findOne({
          where: { employeeId: employee.id, date: yesterdayDateStr, checkOutTime: null },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (yesterdayRecord && yesterdayRecord.checkInTime) {
          record = yesterdayRecord;
        }
      }

      // Resolve Shift
      const targetShiftId = record?.shiftId || employee.shiftId;
      let shift: any = null;
      if (targetShiftId) {
        shift = await this.shiftModel.findOne({
          where: { id: targetShiftId, companyId: punch.companyId },
          transaction: t,
        });
      }

      if (!shift && policy) {
        shift = {
          id: null,
          name: 'Default HR Policy Shift',
          startTime: policy.defaultShiftStartTime,
          endTime: policy.defaultShiftEndTime,
          breakMinutes: policy.defaultBreakMinutes,
          gracePeriodMinutes: policy.lateComingGraceMinutes,
          weeklyOffDays: policy.weeklyOffDays || [],
        };
      }

      // 8. Determine Action: CHECK_IN or CHECK_OUT based on state and logs
      let actionType = AttendanceActionType.CHECK_IN;
      let originalValue: any = null;

      if (record) {
        originalValue = {
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          attendanceState: record.attendanceState,
          attendanceStatus: record.attendanceStatus,
          revision: record.revision,
        };

        if (record.isPayrollLocked) {
          throw new Error('Attendance record is locked after payroll processing');
        }

        // Get sorted logs for today to inspect last action
        const existingLogs = await this.logModel.findAll({
          where: { attendanceRecordId: record.id },
          order: [['timestamp', 'ASC']],
          transaction: t,
        });

        const lastLog = existingLogs[existingLogs.length - 1];

        // State Machine validation check
        if (lastLog && lastLog.actionType === AttendanceActionType.CHECK_IN) {
          actionType = AttendanceActionType.CHECK_OUT;
        } else {
          actionType = AttendanceActionType.CHECK_IN;
        }
      }

      // 9. Execute calculations and update AttendanceRecord
      if (actionType === AttendanceActionType.CHECK_IN) {
        if (!policy.mixedAttendanceAllowed && record && record.attendanceSource === AttendanceSource.SELF_PUNCH) {
          throw new Error('Mixed Web/Biometric attendance is disabled by company policy');
        }

        const lateMinutes = this.helperService.calculateLateMinutes(
          localDetails.minutesOfDay,
          shift.startTime,
          shift.gracePeriodMinutes,
        );

        if (!record) {
          record = await this.recordModel.create({
            employeeId: employee.id,
            companyId: punch.companyId,
            date: targetDateStr,
            checkInTime: correctedTimestamp,
            attendanceStatus: null,
            attendanceState: AttendanceState.WORKING,
            attendanceSource: AttendanceSource.BIOMETRIC,
            lateMinutes,
            shiftId: shift.id,
            revision: 1,
          }, { transaction: t });
        } else {
          await record.update({
            attendanceState: AttendanceState.WORKING,
            checkOutTime: null,
            attendanceSource: AttendanceSource.BIOMETRIC,
            revision: record.revision + 1,
          }, { transaction: t });
        }

        // Create log (saving correlationId)
        await this.logModel.create({
          employeeId: employee.id,
          attendanceRecordId: record.id,
          actionType: AttendanceActionType.CHECK_IN,
          timestamp: correctedTimestamp,
          metadata: {
            deviceSerialNumber: punch.deviceSerialNumber,
            deviceLogId: punch.deviceLogId,
            verificationMethod: 'BIOMETRIC',
            processedTime: new Date(),
            correlationId: punch.correlationId,
          },
        }, { transaction: t });

      } else {
        // CHECK_OUT Action
        if (!policy.mixedAttendanceAllowed && record.attendanceSource === AttendanceSource.SELF_PUNCH) {
          throw new Error('Mixed Web/Biometric attendance is disabled by company policy');
        }

        // Create check out log (saving correlationId)
        await this.logModel.create({
          employeeId: employee.id,
          attendanceRecordId: record.id,
          actionType: AttendanceActionType.CHECK_OUT,
          timestamp: correctedTimestamp,
          metadata: {
            deviceSerialNumber: punch.deviceSerialNumber,
            deviceLogId: punch.deviceLogId,
            verificationMethod: 'BIOMETRIC',
            processedTime: new Date(),
            correlationId: punch.correlationId,
          },
        }, { transaction: t });

        // Load all logs to run calculations
        const allLogs = await this.logModel.findAll({
          where: { attendanceRecordId: record.id },
          order: [['timestamp', 'ASC']],
          transaction: t,
        });

        // Compute multi-interval working hours
        let totalActiveMs = 0;
        let activeIn: Date | null = null;
        for (const log of allLogs) {
          if (log.actionType === AttendanceActionType.CHECK_IN) {
            activeIn = new Date(log.timestamp);
          } else if (log.actionType === AttendanceActionType.CHECK_OUT && activeIn) {
            totalActiveMs += new Date(log.timestamp).getTime() - activeIn.getTime();
            activeIn = null;
          }
        }

        // Subtract break duration
        let totalBreakMs = 0;
        let activeBreak: Date | null = null;
        for (const log of allLogs) {
          if (log.actionType === AttendanceActionType.BREAK_START) {
            activeBreak = new Date(log.timestamp);
          } else if (log.actionType === AttendanceActionType.BREAK_END && activeBreak) {
            totalBreakMs += new Date(log.timestamp).getTime() - activeBreak.getTime();
            activeBreak = null;
          }
        }

        const netWorkingMs = Math.max(0, totalActiveMs - totalBreakMs);
        const netWorkingHours = parseFloat((netWorkingMs / (1000 * 60 * 60)).toFixed(2));

        const evalResult = await this.policyEngine.evaluateAttendanceStatus(
          employee.id,
          punch.companyId,
          record.date,
          record.checkInTime,
          correctedTimestamp,
          shift,
          policy,
          allLogs,
          timezone,
          t,
        );

        await record.update({
          checkOutTime: correctedTimestamp,
          totalHours: netWorkingHours,
          overtimeHours: evalResult.overtimeHours,
          attendanceStatus: evalResult.attendanceStatus,
          attendanceState: AttendanceState.CHECKED_OUT,
          revision: record.revision + 1,
        }, { transaction: t });
      }

      // 10. Write Audit Revision log (attaching correlationId)
      await this.auditTrailModel.create({
        attendanceRecordId: record.id,
        companyId: punch.companyId,
        employeeId: employee.id,
        action: actionType === AttendanceActionType.CHECK_IN ? 'BIOMETRIC_CHECKIN' : 'BIOMETRIC_CHECKOUT',
        revisionNumber: record.revision,
        originalValue: originalValue,
        newValue: {
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          attendanceState: record.attendanceState,
          attendanceStatus: record.attendanceStatus,
          revision: record.revision,
        },
        reason: `Processed punch log ID ${punch.id} from device ${punch.deviceSerialNumber}. Correlation ID: ${punch.correlationId}`,
        changedBy: null, // SYSTEM
      }, { transaction: t });

      // 11. Update raw punch log status to SUCCESS
      await punch.update({
        status: BiometricPunchStatus.SUCCESS,
        processedRecordId: record.id,
        processedTime: new Date(),
      }, { transaction: t });

      await t.commit();

      // 12. Socket.IO Broadcast (Web UI Refresh)
      try {
        const freshRecord = await this.recordModel.findByPk(record.id);
        const [yearStr, monthStr] = freshRecord.date.split('-');
        
        const monthlyReportData = await this.summaryService.getEmployeeMonthlySummary(
          punch.companyId,
          employee.id,
          parseInt(yearStr),
          parseInt(monthStr),
        );

        if (actionType === AttendanceActionType.CHECK_IN) {
          this.attendanceGateway.emitCheckedIn(freshRecord, monthlyReportData.summary);
        } else {
          this.attendanceGateway.emitCheckedOut(freshRecord, monthlyReportData.summary);
        }
      } catch (socketErr) {
        this.logger.error(`Failed to emit socket updates for employee ${employee.id}:`, socketErr);
      }

      this.logger.log(`Successfully processed punch log ID ${punch.id} for Employee ID ${employee.id}`);

    } catch (error: any) {
      await t.rollback();

      this.logger.error(`Error processing punch log ID ${punch.id}:`, error);

      // Exponential backoff retry calculation: retry delay = 2^(retryCount) * 10 seconds
      const nextRetryDelayMs = Math.pow(2, punch.retryCount) * 10 * 1000;
      const nextRetryAt = new Date(Date.now() + nextRetryDelayMs);

      // Save error details, update lastRetryAt & nextRetryAt, and increment retryCount
      await punch.update({
        status: BiometricPunchStatus.FAILED,
        retryCount: punch.retryCount + 1,
        lastError: error.message || String(error),
        lastRetryAt: new Date(),
        nextRetryAt,
      });
    }
  }
}
