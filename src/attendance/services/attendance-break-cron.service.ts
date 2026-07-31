import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import {
  AttendanceRecord,
  AttendanceState,
  AttendanceStatus,
} from '../models/attendance-record.model';
import {
  AttendanceLog,
  AttendanceActionType,
} from '../models/attendance-log.model';
import { CompanyBreakPolicy } from '../models/company-break-policy.model';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { Op } from 'sequelize';
import { AttendanceGateway } from '../gateways/attendance.gateway';

@Injectable()
export class AttendanceBreakCronService {
  private readonly logger = new Logger(AttendanceBreakCronService.name);

  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(AttendanceLog)
    private readonly logModel: typeof AttendanceLog,
    @InjectModel(CompanyBreakPolicy)
    private readonly policyModel: typeof CompanyBreakPolicy,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly attendanceGateway: AttendanceGateway,
  ) {}

  @Cron('*/5 * * * *')
  async processAutomaticBreaks() {
    this.logger.log('Starting 5-minute automatic break cron process...');

    try {
      const now = new Date();
      const tz = 'Asia/Kolkata';
      const currentTimeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
      });
      const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: tz });

      // Fetch all active automatic policies
      const policies = await this.policyModel.findAll({
        where: {
          isAutomatic: true,
          isActive: true,
        },
      });

      const allMutated: AttendanceRecord[] = [];

      for (const policy of policies) {
        // Calculate break end time
        const [startH, startM] = policy.startTime.split(':').map(Number);
        const policyStartMins = startH * 60 + startM;
        const policyEndMins = policyStartMins + policy.durationMinutes;

        const [currH, currM] = currentTimeStr.split(':').map(Number);
        const currentMins = currH * 60 + currM;

        // Condition 1: Break needs to START
        // If current time is past start time but before end time, they should be ON_BREAK
        const shouldBeOnBreak =
          currentMins >= policyStartMins && currentMins < policyEndMins;

        // Condition 2: Break needs to END
        // Check within a robust 2-hour window after policy end to handle server delays/restarts
        const shouldEndBreak =
          currentMins >= policyEndMins && currentMins < policyEndMins + 120;

        if (shouldBeOnBreak) {
          const mutated = await this.startBreaks(policy, todayDateStr, now);
          allMutated.push(...mutated);
        } else if (shouldEndBreak) {
          const mutated = await this.endBreaks(policy, todayDateStr, now);
          allMutated.push(...mutated);
        }
      }

      // Emit socket updates, batching if more than 5 records per company
      const companyRecordsMap = new Map<number, AttendanceRecord[]>();
      for (const rec of allMutated) {
        if (!companyRecordsMap.has(rec.companyId)) {
          companyRecordsMap.set(rec.companyId, []);
        }
        companyRecordsMap.get(rec.companyId).push(rec);
      }

      for (const [companyId, records] of companyRecordsMap.entries()) {
        if (records.length > 5) {
          try {
            this.attendanceGateway.emitBatchUpdate(records, companyId);
          } catch (err) {
            this.logger.error(
              `Failed to emit batch socket update for Company ${companyId}`,
              err,
            );
          }
        } else {
          for (const record of records) {
            try {
              this.attendanceGateway.emitAttendanceUpdate(
                'break_update',
                record,
              );
            } catch (err) {
              this.logger.error(
                `Failed to emit socket update for Employee ${record.employeeId}`,
                err,
              );
            }
          }
        }
      }

      this.logger.log('Automatic break process completed.');
    } catch (error) {
      this.logger.error('Failed to execute automatic break cron job', error);
    }
  }

  private async startBreaks(
    policy: CompanyBreakPolicy,
    dateStr: string,
    timestamp: Date,
  ): Promise<AttendanceRecord[]> {
    // Find all records that are WORKING for this company today
    const records = await this.recordModel.findAll({
      where: {
        companyId: policy.companyId,
        date: dateStr,
        attendanceState: AttendanceState.WORKING,
      },
    });

    if (records.length === 0) return [];

    const t = await this.recordModel.sequelize.transaction();
    try {
      const recordIds = records.map((r) => r.id);
      await this.recordModel.update(
        {
          attendanceState: AttendanceState.ON_BREAK,
        },
        {
          where: { id: recordIds },
          transaction: t,
        },
      );

      const logs = records.map((r) => ({
        employeeId: r.employeeId,
        attendanceRecordId: r.id,
        actionType: AttendanceActionType.BREAK_START,
        timestamp,
        metadata: {
          policyId: policy.id,
          policyName: policy.name,
          autoTriggered: true,
        },
      }));

      await this.logModel.bulkCreate(logs, { transaction: t });
      await t.commit();

      for (const record of records) {
        record.attendanceState = AttendanceState.ON_BREAK;
        this.logger.log(
          `Auto started break for Employee ${record.employeeId} under policy ${policy.name}`,
        );
      }

      return records;
    } catch (err) {
      await t.rollback();
      this.logger.error(
        `Failed to bulk auto-start breaks for policy ${policy.name}`,
        err,
      );
      return [];
    }
  }

  private async endBreaks(
    policy: CompanyBreakPolicy,
    dateStr: string,
    timestamp: Date,
  ): Promise<AttendanceRecord[]> {
    // Find all records that are ON_BREAK for this company today
    const records = await this.recordModel.findAll({
      where: {
        companyId: policy.companyId,
        date: dateStr,
        attendanceState: AttendanceState.ON_BREAK,
      },
    });

    if (records.length === 0) return [];

    const t = await this.recordModel.sequelize.transaction();
    try {
      const recordIds = records.map((r) => r.id);
      await this.recordModel.update(
        {
          attendanceState: AttendanceState.WORKING,
        },
        {
          where: { id: recordIds },
          transaction: t,
        },
      );

      const logs = records.map((r) => ({
        employeeId: r.employeeId,
        attendanceRecordId: r.id,
        actionType: AttendanceActionType.BREAK_END,
        timestamp,
        metadata: {
          policyId: policy.id,
          policyName: policy.name,
          autoTriggered: true,
        },
      }));

      await this.logModel.bulkCreate(logs, { transaction: t });
      await t.commit();

      for (const record of records) {
        record.attendanceState = AttendanceState.WORKING;
        this.logger.log(
          `Auto ended break for Employee ${record.employeeId} under policy ${policy.name}`,
        );
      }

      return records;
    } catch (err) {
      await t.rollback();
      this.logger.error(
        `Failed to bulk auto-end breaks for policy ${policy.name}`,
        err,
      );
      return [];
    }
  }
}
