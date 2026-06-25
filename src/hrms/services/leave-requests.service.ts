import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  LeaveRequest,
  LeaveRequestStatus,
  HalfDayType,
} from '../models/leave-request.model';
import {
  LeaveApprovalStep,
  ApprovalStepStatus,
} from '../models/leave-approval-step.model';
import {
  LeaveApprovalLog,
  LeaveAction,
} from '../models/leave-approval-log.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import { LeaveType } from '../models/leave-type.model';
import { Employee, EmployeeStatus } from '../models/employee.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { AuditService } from '../../audit/services/audit.service';
import { StorageService } from './storage.service';
import { LeaveRequestsWorkflowService } from './leave-requests-workflow.service';
import { LeaveRequestsQueryService } from './leave-requests-query.service';
import {
  ApplyLeaveDto,
  ApproveLeaveDto,
  RejectLeaveDto,
  CancelLeaveDto,
  GetLeaveRequestsFilterDto,
} from '../dto/leave-requests.dto';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceState,
} from '../../attendance/models/attendance-record.model';
import { AttendanceGateway } from '../../attendance/gateways/attendance.gateway';
import * as crypto from 'crypto';
import * as path from 'path';

/** Safely convert a Sequelize DATEONLY value (string "YYYY-MM-DD" or Date) to "YYYY-MM-DD" string. */
function toDateOnlyStr(value: Date | string | any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  return new Date(value).toISOString().split('T')[0];
}

/** Extract year from a Sequelize DATEONLY column safely without UTC offset distortion. */
function getYearFromDateOnly(value: Date | string | any): number {
  return parseInt(toDateOnlyStr(value).substring(0, 4), 10);
}

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(LeaveApprovalStep)
    private readonly leaveApprovalStepModel: typeof LeaveApprovalStep,
    @InjectModel(LeaveApprovalLog)
    private readonly leaveApprovalLogModel: typeof LeaveApprovalLog,
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(LeaveType)
    private readonly leaveTypeModel: typeof LeaveType,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(CompanyHrPolicy)
    private readonly hrPolicyModel: typeof CompanyHrPolicy,
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(AttendanceRecord)
    private readonly attendanceRecordModel: typeof AttendanceRecord,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly workflowService: LeaveRequestsWorkflowService,
    private readonly queryService: LeaveRequestsQueryService,
  ) {}

  async getFallbackEmployeeIdForAdmin(
    companyId: number,
  ): Promise<number | null> {
    const employee = await this.employeeModel.findOne({ where: { companyId } });
    return employee ? employee.id : null;
  }

  private async calculateActualLeaveDays(
    fromDate: string,
    toDate: string,
    companyId: number,
    isHalfDay: boolean,
    policy: any,
  ): Promise<number> {
    if (isHalfDay) return 0.5;

    const start = new Date(fromDate);
    const end = new Date(toDate);

    if (start > end)
      throw new BadRequestException('From date cannot be after To date');

    const weeklyOffDays = policy?.weeklyOffDays || [0, 6]; // 0=Sun, 6=Sat

    const holidays = await this.holidayModel.findAll({
      where: {
        isActive: true,
        holidayDate: {
          [Op.between]: [fromDate, toDate],
        },
      },
      include: [
        {
          model: HolidayCompany,
          required: false,
        },
      ],
    });

    const filteredHolidays = holidays.filter((h) => {
      if (h.holidayCompanies && h.holidayCompanies.length > 0) {
        return h.holidayCompanies.some((hc) => hc.companyId === companyId);
      }
      return true; // client-wide holiday
    });

    const holidayDates = filteredHolidays.map(
      (h) => new Date(h.holidayDate).toISOString().split('T')[0],
    );

    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      const dateString = current.toISOString().split('T')[0];

      if (
        !weeklyOffDays.includes(dayOfWeek) &&
        !holidayDates.includes(dateString)
      ) {
        days++;
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  async applyLeave(
    employeeId: number,
    companyId: number,
    dto: ApplyLeaveDto,
    file?: Express.Multer.File,
    actor?: any,
  ): Promise<LeaveRequest> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const invalidStatuses = [
      EmployeeStatus.DRAFT,
      EmployeeStatus.ONBOARDING,
      EmployeeStatus.TERMINATED,
    ];
    if (invalidStatuses.includes(employee.status)) {
      throw new BadRequestException(
        `Leave cannot be applied while employee status is ${employee.status}`,
      );
    }

    const leaveType = await this.leaveTypeModel.findOne({
      where: { id: dto.leaveTypeId, companyId, isActive: true },
    });
    if (!leaveType)
      throw new NotFoundException('Leave type not found or inactive');

    if (employee.joiningDate && leaveType.minimumServiceDays > 0) {
      const msDiff =
        new Date().getTime() - new Date(employee.joiningDate).getTime();
      const serviceDays = Math.floor(msDiff / (1000 * 3600 * 24));
      if (serviceDays < leaveType.minimumServiceDays) {
        throw new BadRequestException(
          `Minimum service days of ${leaveType.minimumServiceDays} not met. Current: ${serviceDays}`,
        );
      }
    }

    if (
      leaveType.applicableAfterProbation &&
      employee.status === EmployeeStatus.PROBATION
    ) {
      throw new BadRequestException(
        'This leave type is only applicable after probation',
      );
    }

    if (dto.isHalfDay && !leaveType.allowHalfDay) {
      throw new BadRequestException(
        'Half day is not allowed for this leave type',
      );
    }

    const policy = await this.hrPolicyModel.findOne({ where: { companyId } });
    if (!policy) throw new NotFoundException('HR Policy not configured');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reqFromDate = new Date(dto.fromDate);
    reqFromDate.setHours(0, 0, 0, 0);
    const reqToDate = new Date(dto.toDate);
    reqToDate.setHours(0, 0, 0, 0);

    const reqFromDateStr = dto.fromDate.split('T')[0];
    const reqToDateStr = dto.toDate.split('T')[0];

    if (reqFromDate.getFullYear() !== reqToDate.getFullYear()) {
      throw new BadRequestException(
        'Leave request cannot span across different years. Please apply separately.',
      );
    }

    if (dto.isHalfDay && reqFromDateStr !== reqToDateStr) {
      throw new BadRequestException('Half day leave must be for a single day');
    }

    if (reqFromDate < today) {
      if (!policy.allowBackdatedLeave) {
        throw new BadRequestException(
          'Backdated leave applications are not allowed',
        );
      }
      const msDiff = today.getTime() - reqFromDate.getTime();
      const backdatedDays = Math.floor(msDiff / (1000 * 3600 * 24));
      if (
        policy.maxBackdatedDays > 0 &&
        backdatedDays > policy.maxBackdatedDays
      ) {
        throw new BadRequestException(
          `Cannot apply for leave older than ${policy.maxBackdatedDays} days`,
        );
      }
    }

    const totalDays = await this.calculateActualLeaveDays(
      dto.fromDate,
      dto.toDate,
      companyId,
      dto.isHalfDay || false,
      policy,
    );
    if (totalDays === 0) {
      throw new BadRequestException(
        'Total calculated leave days is zero. Cannot apply leave on holidays or weekly offs only.',
      );
    }

    let filePath = null;
    if (file) {
      const relativeDir = `tenants/${companyId}/employees/${employeeId}/leaves`;
      const uniqueFilename = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
      filePath = await this.storageService.uploadFile(
        file,
        relativeDir,
        uniqueFilename,
      );
    }

    const t = await this.leaveRequestModel.sequelize.transaction();
    try {
      // Lock employee record to serialize concurrent applications for the same employee
      await this.employeeModel.findOne({
        where: { id: employeeId },
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ['id'],
      });

      const overlappingRequests = await this.leaveRequestModel.findAll({
        where: {
          employeeId,
          companyId,
          status: {
            [Op.in]: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED],
          },
          fromDate: { [Op.lte]: reqToDateStr },
          toDate: { [Op.gte]: reqFromDateStr },
        },
        transaction: t,
      });

      const actualOverlaps = overlappingRequests.filter((existing) => {
        // existing.fromDate is typically returned as YYYY-MM-DD string by Sequelize for DATEONLY
        const existingFromDateStr =
          typeof existing.fromDate === 'string'
            ? existing.fromDate
            : new Date(existing.fromDate).toISOString().split('T')[0];

        if (
          existing.isHalfDay &&
          dto.isHalfDay &&
          existingFromDateStr === reqFromDateStr
        ) {
          if (existing.halfDayType !== dto.halfDayType) return false;
        }
        return true;
      });

      if (actualOverlaps.length > 0) {
        throw new BadRequestException(
          'Leave request overlaps with an existing pending or approved leave',
        );
      }

      const year = new Date(dto.fromDate).getFullYear();
      let balance = await this.employeeLeaveBalanceModel.findOne({
        where: { employeeId, leaveTypeId: leaveType.id, year },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!balance) {
        const joinDate = new Date(employee.joiningDate || new Date());
        const joinedMonth =
          joinDate.getFullYear() === year ? joinDate.getMonth() : 0;
        const remainingMonths = 12 - joinedMonth;
        const proratedDays = parseFloat(
          ((leaveType.daysPerYear / 12) * remainingMonths).toFixed(2),
        );

        balance = await this.employeeLeaveBalanceModel.create(
          {
            companyId,
            employeeId,
            leaveTypeId: leaveType.id,
            year,
            totalAllocated: proratedDays,
            remainingDays: proratedDays,
            usedDays: 0,
            pendingDays: 0,
            carryForwardDays: 0,
          },
          { transaction: t },
        );
      }

      if (balance.remainingDays < totalDays) {
        throw new BadRequestException(
          `Insufficient leave balance. Required: ${totalDays}, Remaining: ${balance.remainingDays}`,
        );
      }

      const leaveRequest = await this.leaveRequestModel.create(
        {
          companyId,
          employeeId,
          leaveTypeId: leaveType.id,
          fromDate: new Date(dto.fromDate),
          toDate: new Date(dto.toDate),
          totalDays,
          isHalfDay: dto.isHalfDay || false,
          halfDayType: dto.halfDayType || null,
          reason: dto.reason || null,
          status: leaveType.requiresApproval
            ? LeaveRequestStatus.PENDING
            : LeaveRequestStatus.APPROVED,
          attachmentPath: filePath,
          mimeType: file?.mimetype || null,
          fileSize: file?.size || null,
          currentApprovalLevel: 1,
          finalApprovalLevel: 1, // Single manager approval by default for now
        } as any,
        { transaction: t },
      );

      if (leaveType.requiresApproval) {
        let approverId = employee.managerId;
        if (!approverId) {
          approverId = await this.getFallbackEmployeeIdForAdmin(companyId);
        }

        if (approverId) {
          await this.leaveApprovalStepModel.create(
            {
              leaveRequestId: leaveRequest.id,
              approverId: approverId,
              level: 1,
              status: ApprovalStepStatus.PENDING,
            },
            { transaction: t },
          );
        } else {
          throw new BadRequestException(
            'No manager or admin found to approve this leave request.',
          );
        }
      }

      // Deduct from balance
      if (leaveRequest.status === LeaveRequestStatus.PENDING) {
        await balance.update(
          {
            pendingDays: Number(balance.pendingDays) + totalDays,
            remainingDays: Number(balance.remainingDays) - totalDays,
          },
          { transaction: t },
        );
      } else if (leaveRequest.status === LeaveRequestStatus.APPROVED) {
        await balance.update(
          {
            usedDays: Number(balance.usedDays) + totalDays,
            remainingDays: Number(balance.remainingDays) - totalDays,
          },
          { transaction: t },
        );
      }

      await this.leaveApprovalLogModel.create(
        {
          leaveRequestId: leaveRequest.id,
          action: LeaveAction.CREATED,
          performedBy: actor?.userId || null,
          remarks: 'Leave request submitted',
        },
        { transaction: t },
      );

      await t.commit();
      return leaveRequest;
    } catch (err) {
      await t.rollback();
      if (filePath)
        await this.storageService.deleteFile(filePath).catch(() => {});
      throw err;
    }
  }

  async approveLeave(
    requestId: number,
    companyId: number,
    approverId: number,
    dto: ApproveLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    return this.workflowService.approveLeave(
      requestId,
      companyId,
      approverId,
      dto,
      actor,
    );
  }

  async rejectLeave(
    requestId: number,
    companyId: number,
    approverId: number,
    dto: RejectLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    return this.workflowService.rejectLeave(
      requestId,
      companyId,
      approverId,
      dto,
      actor,
    );
  }

  async cancelLeave(
    requestId: number,
    companyId: number,
    employeeId: number,
    dto: CancelLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    return this.workflowService.cancelLeave(
      requestId,
      companyId,
      employeeId,
      dto,
      actor,
    );
  }

  async getLeaveRequests(
    companyId: number,
    query: GetLeaveRequestsFilterDto,
  ): Promise<{ data: LeaveRequest[]; meta: any }> {
    return this.queryService.getLeaveRequests(companyId, query);
  }

  async getLeaveRequestById(
    id: number,
    companyId: number,
  ): Promise<LeaveRequest> {
    return this.queryService.getLeaveRequestById(id, companyId);
  }

  async getDashboardSummary(
    companyId: number,
    employeeId: number,
  ): Promise<any> {
    return this.queryService.getDashboardSummary(companyId, employeeId);
  }
}
