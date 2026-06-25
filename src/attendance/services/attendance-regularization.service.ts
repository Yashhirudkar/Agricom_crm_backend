import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceState,
  AttendanceSource,
} from '../models/attendance-record.model';
import {
  AttendanceLog,
  AttendanceActionType,
} from '../models/attendance-log.model';
import {
  AttendanceException,
  AttendanceExceptionType,
  AttendanceExceptionStatus,
} from '../models/attendance-exception.model';
import { Shift } from '../models/shift.model';
import { Employee } from '../../hrms/models/employee.model';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../../hrms/models/leave-request.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import {
  RequestCorrectionDto,
  ResolveCorrectionDto,
} from '../dto/attendance.dto';
import { Op } from 'sequelize';
import { AttendanceGateway } from '../gateways/attendance.gateway';
import { AttendanceHelperService } from './attendance-helper.service';
import { User } from '../../users/models/user.model';
import { Designation } from '../../hrms/models/designation.model';

@Injectable()
export class AttendanceRegularizationService {
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
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly helperService: AttendanceHelperService,
  ) {}

  // 5. Attendance Correction Request
  async requestCorrection(
    employeeId: number,
    companyId: number,
    dto: RequestCorrectionDto,
  ): Promise<AttendanceException> {
    const employee = await this.helperService.getActiveEmployee(
      employeeId,
      companyId,
    );
    const policy = await this.policyModel.findOne({ where: { companyId } });

    if (!policy || !policy.allowAttendanceCorrection) {
      throw new ForbiddenException(
        'Attendance corrections are not allowed by company policy',
      );
    }

    // Leave Check
    const activeLeave = await this.leaveRequestModel.findOne({
      where: {
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.lte]: dto.date },
        toDate: { [Op.gte]: dto.date },
      },
    });

    if (activeLeave) {
      throw new ConflictException(
        `Regularization blocked: You have an approved leave for ${dto.date}.`,
      );
    }

    // Check age of request
    const timezone = employee.branch?.timezone || 'Asia/Kolkata';
    const { todayDateStr } = this.helperService.getLocalTimeDetails(timezone);
    const todayDate = new Date(todayDateStr);
    const requestDate = new Date(dto.date);

    if (
      requestDate.getFullYear() !== todayDate.getFullYear() ||
      requestDate.getMonth() !== todayDate.getMonth()
    ) {
      throw new BadRequestException(
        `Correction requests are only allowed for dates within the current month (Requested date: ${dto.date}, Current month: ${todayDateStr.substring(0, 7)}).`,
      );
    }

    if (requestDate > todayDate) {
      throw new BadRequestException(
        `Correction requests cannot be made for future dates (Requested date: ${dto.date}, Current date: ${todayDateStr}).`,
      );
    }

    // Load existing record for the date if it exists
    const record = await this.recordModel.findOne({
      where: { employeeId, date: dto.date },
    });

    if (record && record.isPayrollLocked) {
      throw new ForbiddenException(
        'Attendance locked after payroll processing',
      );
    }

    // Validations based on type
    if (dto.requestType === AttendanceExceptionType.REGULARIZATION && !record) {
      throw new BadRequestException(
        'No attendance record exists for this date to correct. Use MISSED_PUNCH instead.',
      );
    }

    // Check if there is already a PENDING exception request for this date or record
    const pendingExceptions = await this.exceptionModel.findAll({
      where: {
        employeeId,
        status: AttendanceExceptionStatus.PENDING,
      },
    });

    const hasDuplicate = pendingExceptions.some((exc) => {
      if (record && exc.attendanceRecordId === record.id) return true;
      if (exc.metadata && exc.metadata.date === dto.date) return true;
      return false;
    });

    if (hasDuplicate) {
      throw new BadRequestException(
        'A pending correction request already exists for this date.',
      );
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
    });
  }

  // 6. Approve Correction Request
  async approveCorrection(
    exceptionId: number,
    companyId: number,
    approverEmployeeId: number,
    approverType: string,
    dto: ResolveCorrectionDto,
  ): Promise<AttendanceException> {
    const exception = await this.exceptionModel.findByPk(exceptionId, {
      include: [{ model: Employee, as: 'employee' }],
    });

    if (!exception) {
      throw new NotFoundException(
        `Correction request with ID ${exceptionId} not found`,
      );
    }

    if (exception.status !== AttendanceExceptionStatus.PENDING) {
      throw new BadRequestException(
        `Correction request is already resolved (Status: ${exception.status})`,
      );
    }

    if (exception.employeeId === approverEmployeeId) {
      throw new ForbiddenException(
        'You cannot approve or reject your own correction request',
      );
    }

    const employee = exception.employee;

    // Manager/Admin approval chain validation
    if (approverType !== 'super_admin' && approverType !== 'client_admin') {
      if (employee.managerId !== approverEmployeeId) {
        throw new ForbiddenException(
          'Only the designated manager or an admin can approve this correction request',
        );
      }
    }

    const timezone = employee.branch?.timezone || 'Asia/Kolkata';

    const proposedCheckIn = exception.metadata?.proposedCheckInTime
      ? new Date(exception.metadata.proposedCheckInTime)
      : null;
    const proposedCheckOut = exception.metadata?.proposedCheckOutTime
      ? new Date(exception.metadata.proposedCheckOutTime)
      : null;
    const requestDateStr =
      exception.metadata?.date ||
      exception.createdAt.toLocaleDateString('en-CA', { timeZone: timezone });

    const t = await this.recordModel.sequelize.transaction();

    try {
      console.log('BEFORE record fetch');
      let record = await this.recordModel.findOne({
        where: { employeeId: employee.id, date: requestDateStr },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      console.log('AFTER record fetch');

      if (record && record.isPayrollLocked) {
        throw new ForbiddenException(
          'Attendance locked after payroll processing',
        );
      }

      // Fetch policy
      const policy = await this.policyModel.findOne({
        where: { companyId },
        transaction: t,
      });

      // Resolve Shift details
      const shiftId = record?.shiftId || employee.shiftId;
      let shift: any = null;
      if (shiftId) {
        shift = await this.shiftModel.findOne({
          where: { id: shiftId, companyId },
          transaction: t,
        });
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

      const finalCheckIn =
        proposedCheckIn ||
        (record
          ? record.checkInTime
            ? new Date(record.checkInTime)
            : null
          : null);
      const finalCheckOut =
        proposedCheckOut ||
        (record
          ? record.checkOutTime
            ? new Date(record.checkOutTime)
            : null
          : null);

      if (finalCheckIn) {
        const checkInTimeStr = finalCheckIn.toLocaleTimeString('en-US', {
          hour12: false,
          timeZone: timezone,
        });
        const [inH, inM] = checkInTimeStr.split(':').map(Number);
        lateMinutes = this.helperService.calculateLateMinutes(
          inH * 60 + inM,
          shift.startTime,
          shift.gracePeriodMinutes,
        );
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
            } else if (
              log.actionType === AttendanceActionType.BREAK_END &&
              breakStart
            ) {
              breakDurationMs += log.timestamp.getTime() - breakStart.getTime();
              breakStart = null;
            }
          }
          if (breakStart && finalCheckOut.getTime() > breakStart.getTime()) {
            breakDurationMs += finalCheckOut.getTime() - breakStart.getTime();
          }
        }

        const breakMinutes = shift.breakMinutes || 0;
        const totalDurationMs =
          finalCheckOut.getTime() - finalCheckIn.getTime();
        totalHours = Math.max(
          0,
          parseFloat(
            ((totalDurationMs - breakDurationMs) / (1000 * 60 * 60)).toFixed(2),
          ),
        );

        // Shift duration for OT
        const [shStart, smStart] = shift.startTime.split(':').map(Number);
        const [shEnd, smEnd] = shift.endTime.split(':').map(Number);
        let shiftDiff = shEnd * 60 + smEnd - (shStart * 60 + smStart);
        if (shiftDiff < 0) {
          shiftDiff += 24 * 60;
        }
        const shiftHours = Math.max(0, (shiftDiff - breakMinutes) / 60);

        if (policy?.overtimeAllowed && totalHours > shiftHours) {
          overtimeHours = parseFloat((totalHours - shiftHours).toFixed(2));
        }
      }

      // Determine Status
      const minHoursPresent =
        policy?.minHoursForPresent !== undefined
          ? Number(policy.minHoursForPresent)
          : 8;
      const minHoursHalfDay =
        policy?.minHoursForHalfDay !== undefined
          ? Number(policy.minHoursForHalfDay)
          : 4;
      let finalStatus = record
        ? record.attendanceStatus
        : AttendanceStatus.PRESENT;

      if (finalCheckIn && !finalCheckOut) {
        finalStatus =
          lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
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

      const stateToSet = finalCheckOut
        ? AttendanceState.CHECKED_OUT
        : finalCheckIn
          ? AttendanceState.WORKING
          : AttendanceState.NOT_CHECKED_IN;

      if (!record) {
        record = await this.recordModel.create(
          {
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
          },
          { transaction: t },
        );
        await record.reload({ transaction: t });
      } else {
        console.log('BEFORE record.update');
        await record.update(
          {
            checkInTime: finalCheckIn,
            checkOutTime: finalCheckOut,
            totalHours,
            overtimeHours,
            lateMinutes,
            attendanceStatus: finalStatus,
            attendanceState: stateToSet,
            attendanceSource: AttendanceSource.REGULARIZATION_APPROVED,
            shiftId: shift.id,
          },
          { transaction: t },
        );
        console.log('AFTER record.update');
        await record.reload({ transaction: t });
        console.log('AFTER record.reload');
      }

      // Update Exception status
      await exception.update(
        {
          status: AttendanceExceptionStatus.APPROVED,
          approvedBy: approverEmployeeId,
          remarks: dto.remarks || 'Approved by Manager/Admin',
          attendanceRecordId: record.id,
        },
        { transaction: t },
      );

      // Create correction log
      await this.logModel.create(
        {
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
        },
        { transaction: t },
      );

      await t.commit(); // Ensure all DB changes are committed
      console.log('AFTER transaction commit');

      // --- PATCH START ---
      // Fetch a fresh AttendanceRecord after commit to ensure all fields are up-to-date.
      // This resolves stale data issues for returned objects and websocket emissions.
      let freshRecord = null;
      if (record) {
        // Only fetch if a record was actually created or updated
        freshRecord = await this.recordModel.findByPk(record.id, {
          include: [Employee],
        });
      }
      console.log('AFTER fresh DB query');
      // --- PATCH END ---

      if (!freshRecord) {
        throw new InternalServerErrorException(
          'Failed to fetch updated attendance record after approval',
        );
      }

      this.attendanceGateway.emitAttendanceUpdate(
        'regularization_approved',
        freshRecord,
      );

      exception.setDataValue('attendanceRecord', freshRecord);

      console.log('BEFORE return exception');
      return exception;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // 7. Reject Correction Request
  async rejectCorrection(
    exceptionId: number,
    approverEmployeeId: number,
    approverType: string,
    dto: ResolveCorrectionDto,
  ): Promise<AttendanceException> {
    const exception = await this.exceptionModel.findByPk(exceptionId, {
      include: [{ model: Employee, as: 'employee' }],
    });

    if (!exception) {
      throw new NotFoundException(
        `Correction request with ID ${exceptionId} not found`,
      );
    }

    if (exception.status !== AttendanceExceptionStatus.PENDING) {
      throw new BadRequestException(
        `Correction request is already resolved (Status: ${exception.status})`,
      );
    }

    if (exception.employeeId === approverEmployeeId) {
      throw new ForbiddenException(
        'You cannot approve or reject your own correction request',
      );
    }

    const employee = exception.employee;

    if (approverType !== 'super_admin' && approverType !== 'client_admin') {
      if (employee.managerId !== approverEmployeeId) {
        throw new ForbiddenException(
          'Only the designated manager or an admin can reject this correction request',
        );
      }
    }

    if (exception.attendanceRecordId) {
      const record = await this.recordModel.findByPk(
        exception.attendanceRecordId,
      );
      if (record && record.isPayrollLocked) {
        throw new ForbiddenException(
          'Attendance locked after payroll processing',
        );
      }
    }

    await exception.update({
      status: AttendanceExceptionStatus.REJECTED,
      approvedBy: approverEmployeeId,
      remarks: dto.remarks || 'Rejected by Manager/Admin',
    });

    if (exception.attendanceRecordId) {
      const record = await this.recordModel.findByPk(
        exception.attendanceRecordId,
      );
      if (record) {
        try {
          this.attendanceGateway.emitAttendanceUpdate(
            'regularization_rejected',
            record,
          );
        } catch (err) {
          console.error('Socket emit error in rejectCorrection:', err);
        }
      }
    }

    return exception;
  }
}
