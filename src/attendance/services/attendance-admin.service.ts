import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord, AttendanceStatus, AttendanceState, AttendanceSource } from '../models/attendance-record.model';
import { AttendanceLog, AttendanceActionType } from '../models/attendance-log.model';
import { Shift } from '../models/shift.model';
import { Employee } from '../../hrms/models/employee.model';
import { EmployeeLeaveBalance } from '../../hrms/models/employee-leave-balance.model';
import { LeaveType } from '../../hrms/models/leave-type.model';
import { Op } from 'sequelize';
import { AttendanceGateway } from '../gateways/attendance.gateway';

@Injectable()
export class AttendanceAdminService {
  constructor(
    @InjectModel(AttendanceRecord)
    private readonly recordModel: typeof AttendanceRecord,
    @InjectModel(AttendanceLog)
    private readonly logModel: typeof AttendanceLog,
    @InjectModel(Shift)
    private readonly shiftModel: typeof Shift,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(LeaveType)
    private readonly leaveTypeModel: typeof LeaveType,
    private readonly attendanceGateway: AttendanceGateway,
  ) {}

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
