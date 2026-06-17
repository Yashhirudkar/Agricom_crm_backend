import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceState, AttendanceStatus } from '../models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../models/attendance-log.model';
import { CompanyBreakPolicy } from '../models/company-break-policy.model';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
import { Op } from 'sequelize';

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
  ) {}

  @Cron('*/5 * * * *')
  async processAutomaticBreaks() {
    this.logger.log('Starting 5-minute automatic break cron process...');

    try {
      const now = new Date();
      // Get current time in HH:MM format
      // Note: In a robust multi-timezone app, we should check against company/branch timezone.
      // For simplicity, we use the server local time for the cron matching or Asia/Kolkata.
      const tz = 'Asia/Kolkata';
      const currentTimeStr = now.toLocaleTimeString('en-US', { hour12: false, timeZone: tz, hour: '2-digit', minute: '2-digit' });
      const todayDateStr = now.toLocaleDateString('en-CA', { timeZone: tz });

      // Fetch all active automatic policies
      const policies = await this.policyModel.findAll({
        where: {
          isAutomatic: true,
          isActive: true,
        },
      });

      for (const policy of policies) {
        // Calculate break end time
        const [startH, startM] = policy.startTime.split(':').map(Number);
        const policyStartMins = startH * 60 + startM;
        const policyEndMins = policyStartMins + policy.durationMinutes;

        const [currH, currM] = currentTimeStr.split(':').map(Number);
        const currentMins = currH * 60 + currM;

        // Condition 1: Break needs to START
        // If current time is past start time but before end time, they should be ON_BREAK
        const shouldBeOnBreak = currentMins >= policyStartMins && currentMins < policyEndMins;

        // Condition 2: Break needs to END
        // If current time is just past the end time, they should return to WORKING
        const shouldEndBreak = currentMins >= policyEndMins && currentMins < policyEndMins + 5;

        if (shouldBeOnBreak) {
          await this.startBreaks(policy, todayDateStr, now);
        } else if (shouldEndBreak) {
          await this.endBreaks(policy, todayDateStr, now);
        }
      }

      this.logger.log('Automatic break process completed.');
    } catch (error) {
      this.logger.error('Failed to execute automatic break cron job', error);
    }
  }

  private async startBreaks(policy: CompanyBreakPolicy, dateStr: string, timestamp: Date) {
    // Find all records that are WORKING for this company today
    const records = await this.recordModel.findAll({
      where: {
        companyId: policy.companyId,
        date: dateStr,
        attendanceState: AttendanceState.WORKING,
      },
    });

    for (const record of records) {
      const t = await this.recordModel.sequelize!.transaction();
      try {
        await record.update({
          attendanceState: AttendanceState.ON_BREAK,
        }, { transaction: t });

        await this.logModel.create({
          employeeId: record.employeeId,
          attendanceRecordId: record.id,
          actionType: AttendanceActionType.BREAK_START,
          timestamp,
          metadata: {
            policyId: policy.id,
            policyName: policy.name,
            autoTriggered: true,
          },
        } as any, { transaction: t });

        await t.commit();
        this.logger.log(`Auto started break for Employee ${record.employeeId} under policy ${policy.name}`);
      } catch (err) {
        await t.rollback();
        this.logger.error(`Failed to auto-start break for Employee ${record.employeeId}`, err);
      }
    }
  }

  private async endBreaks(policy: CompanyBreakPolicy, dateStr: string, timestamp: Date) {
    // Find all records that are ON_BREAK for this company today
    const records = await this.recordModel.findAll({
      where: {
        companyId: policy.companyId,
        date: dateStr,
        attendanceState: AttendanceState.ON_BREAK,
      },
    });

    for (const record of records) {
      // Before blindly ending, verify they are actually on THIS break using logs, 
      // but to keep it simple, we just end the break and return them to WORKING.
      const t = await this.recordModel.sequelize!.transaction();
      try {
        await record.update({
          attendanceState: AttendanceState.WORKING,
        }, { transaction: t });

        await this.logModel.create({
          employeeId: record.employeeId,
          attendanceRecordId: record.id,
          actionType: AttendanceActionType.BREAK_END,
          timestamp,
          metadata: {
            policyId: policy.id,
            policyName: policy.name,
            autoTriggered: true,
          },
        } as any, { transaction: t });

        await t.commit();
        this.logger.log(`Auto ended break for Employee ${record.employeeId} under policy ${policy.name}`);
      } catch (err) {
        await t.rollback();
        this.logger.error(`Failed to auto-end break for Employee ${record.employeeId}`, err);
      }
    }
  }
}
