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
import { Shift } from '../../attendance/models/shift.model';
import { LeaveRequestHandoverUser } from '../models/leave-request-handover-user.model';
import { User } from '../../users/models/user.model';
import { UserCompany } from '../../users/models/user-company.model';
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
  CancelApprovedLeaveDto,
  GetLeaveRequestsFilterDto,
} from '../dto/leave-requests.dto';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceState,
} from '../../attendance/models/attendance-record.model';
import { AttendanceGateway } from '../../attendance/gateways/attendance.gateway';
import {
  NotificationsService,
  NotificationType,
} from '../../notifications/services/notifications.service';
import { LeaveCalculationService } from './leave-calculation.service';
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
    @InjectModel(LeaveRequestHandoverUser)
    private readonly leaveRequestHandoverUserModel: typeof LeaveRequestHandoverUser,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(AttendanceRecord)
    private readonly attendanceRecordModel: typeof AttendanceRecord,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly workflowService: LeaveRequestsWorkflowService,
    private readonly queryService: LeaveRequestsQueryService,
    private readonly notificationsService: NotificationsService,
    private readonly leaveCalculationService: LeaveCalculationService,
  ) {}

  async getHandoverEmployees(
    companyId: number,
    currentUserId?: number,
    currentEmployeeId?: number,
    search?: string,
  ) {
    const whereEmp: any = {
      companyId,
      status: {
        [Op.notIn]: [
          EmployeeStatus.TERMINATED,
          EmployeeStatus.RESIGNED,
          EmployeeStatus.DRAFT,
        ],
      },
      departmentId: { [Op.ne]: null },
    };

    if (currentEmployeeId) {
      whereEmp.id = { [Op.ne]: currentEmployeeId };
    }

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      whereEmp[Op.or] = [
        { firstName: { [Op.iLike]: pattern } },
        { lastName: { [Op.iLike]: pattern } },
        { email: { [Op.iLike]: pattern } },
      ];
    }

    const employees = await this.employeeModel.findAll({
      where: whereEmp,
      attributes: ['id', 'userId', 'firstName', 'lastName', 'email', 'status'],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'status', 'isActive'],
          required: true,
          include: [
            {
              model: UserCompany,
              where: {
                companyId,
                status: 'Active',
                roleId: { [Op.ne]: null },
              },
              attributes: [],
              required: true,
            },
          ],
        },
      ],
      order: [
        ['firstName', 'ASC'],
        ['lastName', 'ASC'],
      ],
      limit: 200,
    });

    const activeEmployees = employees.filter((emp) => {
      if (
        currentUserId &&
        (emp.userId === currentUserId || emp.user?.id === currentUserId)
      ) {
        return false;
      }
      if (emp.user) {
        if (emp.user.isActive === false) return false;
        const uStatus = (emp.user.status || '').toLowerCase();
        if (uStatus === 'inactive' || uStatus === 'suspended') return false;
      }
      return true;
    });

    return activeEmployees.map((emp) => {
      const rawName = `${emp.firstName || ''} ${emp.lastName || ''}`
        .replace(/\s+/g, ' ')
        .trim();
      const displayName =
        rawName ||
        emp.user?.name ||
        emp.email ||
        `User #${emp.userId || emp.id}`;
      const resolvedUserId = emp.userId || emp.user?.id || emp.id;
      return {
        value: resolvedUserId,
        label: displayName.toUpperCase(),
        userId: resolvedUserId,
        employeeId: emp.id,
        email: emp.email || emp.user?.email,
      };
    });
  }

  async getLeaveApprovalRecipients(
    companyId: number,
    managerId?: number,
  ): Promise<number[]> {
    const recipients = new Set<number>();

    if (managerId) {
      const manager = await this.employeeModel.findByPk(managerId);
      if (manager && manager.userId) {
        recipients.add(manager.userId);
      }
    }

    try {
      const resourceActions =
        await this.employeeModel.sequelize.models.ResourceAction.findAll({
          include: [
            {
              model: this.employeeModel.sequelize.models.ModuleResource,
              required: true,
              as: 'resource',
            },
          ],
        });

      const allowedActionIds = resourceActions
        .filter((ra: any) => {
          const resourceName = ra.resource?.name;
          const actionName = ra.name?.toLowerCase();
          if (!resourceName || !actionName) return false;

          let res = resourceName;
          let act = actionName;
          if (res === 'manager' && act === 'approve_leave') {
            res = 'leave';
            act = 'approve';
          }
          return `${res}:${act}` === 'leave:approve';
        })
        .map((ra: any) => ra.id);

      if (allowedActionIds.length > 0) {
        const rolePermissions =
          await this.employeeModel.sequelize.models.RoleActionPermission.findAll(
            {
              where: { resource_action_id: allowedActionIds },
              attributes: ['role_id'],
            },
          );
        const roleIds = rolePermissions.map((rp: any) => rp.role_id);

        if (roleIds.length > 0) {
          const companyMemberships =
            await this.employeeModel.sequelize.models.UserCompany.findAll({
              where: {
                companyId,
                roleId: roleIds,
                status: 'Active',
              },
              attributes: ['userId'],
            });
          companyMemberships.forEach((m: any) => recipients.add(m.userId));

          const globalUserRoles =
            await this.employeeModel.sequelize.models.UserRole.findAll({
              where: { roleId: roleIds },
              attributes: ['userId'],
            });

          const globalUserIds = globalUserRoles.map((ur: any) => ur.userId);
          if (globalUserIds.length > 0) {
            const companyProfile =
              await this.employeeModel.sequelize.models.Company.findByPk(
                companyId,
              );
            if (companyProfile) {
              const activeClientAdmins =
                await this.employeeModel.sequelize.models.User.findAll({
                  where: {
                    id: globalUserIds,
                    clientId: (companyProfile as any).clientId,
                    isActive: true,
                  },
                  attributes: ['id'],
                });
              activeClientAdmins.forEach((u: any) => recipients.add(u.id));
            }
          }
        }
      }

      const superAdmin = await this.employeeModel.sequelize.models.User.findOne(
        {
          where: { email: 'admin@agricom.com', isActive: true },
          attributes: ['id'],
        },
      );
      if (superAdmin) {
        recipients.add((superAdmin as any).id);
      }
    } catch (err) {
      console.error(
        '[LeaveRequestsService] Error finding permission-based recipients:',
        err,
      );
    }

    return Array.from(recipients).filter(Boolean);
  }

  async getFallbackEmployeeIdForAdmin(
    companyId: number,
  ): Promise<number | null> {
    const employee = await this.employeeModel.findOne({ where: { companyId } });
    return employee ? employee.id : null;
  }

  async calculateActualLeaveDays(
    fromDate: string,
    toDate: string,
    companyId: number,
    isHalfDay: boolean,
    weeklyOffDays?: number[],
    employeeId?: number,
  ): Promise<number> {
    return this.leaveCalculationService.calculateActualLeaveDays({
      fromDate,
      toDate,
      companyId,
      employeeId: employeeId || 0,
      isHalfDay,
      weeklyOffDays,
    });
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
      include: [{ model: Shift, required: false }],
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

    if (!dto.handoverUserIds || dto.handoverUserIds.length === 0) {
      throw new BadRequestException(
        'Minimum 1 employee is required for work handover',
      );
    }

    const currentApplicantUserId = actor?.userId || employee.userId;
    for (const hId of dto.handoverUserIds) {
      if (hId === currentApplicantUserId || hId === employeeId) {
        throw new BadRequestException(
          'You cannot assign yourself for work handover',
        );
      }
    }

    const candidateEmployees = await this.employeeModel.findAll({
      where: {
        companyId,
        [Op.or]: [
          { userId: { [Op.in]: dto.handoverUserIds } },
          { id: { [Op.in]: dto.handoverUserIds } },
        ],
        status: {
          [Op.notIn]: [
            EmployeeStatus.TERMINATED,
            EmployeeStatus.RESIGNED,
            EmployeeStatus.DRAFT,
          ],
        },
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'isActive', 'status'],
          required: false,
        },
      ],
    });

    const validHandoverUserIds: number[] = [];
    for (const hId of dto.handoverUserIds) {
      const matched = candidateEmployees.find(
        (e) => e.userId === hId || e.id === hId,
      );
      if (matched) {
        const uId = matched.userId || matched.user?.id || matched.id;
        if (uId && !validHandoverUserIds.includes(uId)) {
          validHandoverUserIds.push(uId);
        }
      } else {
        const directUser = await this.userModel.findOne({
          where: {
            id: hId,
            [Op.or]: [{ clientId: companyId }, { lastCompanyId: companyId }],
            isActive: true,
          },
        });
        if (directUser && !validHandoverUserIds.includes(directUser.id)) {
          validHandoverUserIds.push(directUser.id);
        }
      }
    }

    if (validHandoverUserIds.length === 0) {
      throw new BadRequestException(
        'Selected work handover employees are invalid or inactive',
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

    let weeklyOffDays = [0, 6];
    if (employee.shift && Array.isArray(employee.shift.weeklyOffDays)) {
      weeklyOffDays = employee.shift.weeklyOffDays;
    } else if (policy && Array.isArray(policy.weeklyOffDays)) {
      weeklyOffDays = policy.weeklyOffDays;
    }

    const totalDays =
      await this.leaveCalculationService.calculateActualLeaveDays({
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        companyId,
        employeeId,
        isHalfDay: dto.isHalfDay || false,
        weeklyOffDays,
      });
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
        const initialAllocated = Number(leaveType.daysPerYear || 0);
        balance = await this.employeeLeaveBalanceModel.create(
          {
            companyId,
            employeeId,
            leaveTypeId: leaveType.id,
            year,
            totalAllocated: initialAllocated,
            remainingDays: initialAllocated,
            usedDays: 0,
            pendingDays: 0,
            carryForwardDays: 0,
          },
          { transaction: t },
        );
      }

      const effectiveTotal =
        leaveType.daysPerYear != null
          ? Number(leaveType.daysPerYear)
          : Number(balance.totalAllocated || 0);
      const effectiveRemaining =
        effectiveTotal -
        Number(balance.usedDays || 0) -
        Number(balance.pendingDays || 0) +
        Number(balance.carryForwardDays || 0);

      if (effectiveRemaining < totalDays) {
        throw new BadRequestException(
          `Insufficient leave balance. Required: ${totalDays}, Remaining: ${Math.max(0, effectiveRemaining)}`,
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

      await this.leaveRequestHandoverUserModel.bulkCreate(
        validHandoverUserIds.map((uId) => ({
          leaveRequestId: leaveRequest.id,
          userId: uId,
          assignedBy: actor?.userId || null,
          assignedAt: new Date(),
        })),
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
        const newPending = Number(balance.pendingDays) + totalDays;
        await balance.update(
          {
            pendingDays: newPending,
            remainingDays: Math.max(0, effectiveRemaining - totalDays),
          },
          { transaction: t },
        );
      } else if (leaveRequest.status === LeaveRequestStatus.APPROVED) {
        const newUsed = Number(balance.usedDays) + totalDays;
        await balance.update(
          {
            usedDays: newUsed,
            remainingDays: Math.max(0, effectiveRemaining - totalDays),
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

      try {
        const recipients = await this.getLeaveApprovalRecipients(
          companyId,
          employee.managerId,
        );
        const fromDateStr = toDateOnlyStr(dto.fromDate);
        const toDateStr = toDateOnlyStr(dto.toDate);
        await this.notificationsService.createNotification({
          recipients,
          type: NotificationType.HR,
          referenceType: 'leave_applied',
          referenceId: leaveRequest.id,
          title: '📄 New Leave Request',
          payload: {
            message: `New leave request submitted by ${employee.firstName} ${employee.lastName} (${leaveType.name}) from ${fromDateStr} to ${toDateStr}. Reason: ${dto.reason || 'None'}`,
            url: '/attendance/leave-approvals',
          },
          category: 'LEAVE',
        });
      } catch (notifErr) {
        console.error(
          '[LeaveRequestsService] Failed to send leave request notification:',
          notifErr,
        );
      }

      try {
        const fromDateStr = toDateOnlyStr(dto.fromDate);
        const toDateStr = toDateOnlyStr(dto.toDate);
        const applicantFullName =
          `${employee.firstName} ${employee.lastName}`.trim();
        await this.notificationsService.createNotification({
          recipients: validHandoverUserIds,
          type: NotificationType.HR,
          referenceType: 'leave_handover',
          referenceId: leaveRequest.id,
          title: '🤝 Work Handover Assignment',
          payload: {
            message: `${applicantFullName} has assigned you as work handover for leave from ${fromDateStr} to ${toDateStr}.`,
            url: `/my-leaves?requestId=${leaveRequest.id}`,
            entityType: 'LEAVE_REQUEST',
          },
          category: 'LEAVE',
          companyId,
        });
      } catch (handoverNotifErr) {
        console.error(
          '[LeaveRequestsService] Failed to send handover notifications:',
          handoverNotifErr,
        );
      }

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

  async cancelApprovedLeave(
    requestId: number,
    companyId: number,
    dto: CancelApprovedLeaveDto,
    actor?: any,
  ): Promise<{ message: string }> {
    return this.workflowService.cancelApprovedLeave(
      requestId,
      companyId,
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

  async getMonthlyLeaveSummary(
    companyId: number,
    query: {
      month?: string;
      year?: number;
      departmentId?: number;
      branchId?: number;
      page?: number;
      limit?: number;
    },
  ): Promise<any> {
    return this.queryService.getMonthlyLeaveSummary(companyId, query);
  }

  async getLeaveRequestsPaginated(
    companyId: number,
    tab: 'PENDING' | 'HISTORY',
    cursor?: string,
    limit?: number,
  ): Promise<any> {
    return this.queryService.getLeaveRequestsPaginated(
      companyId,
      tab,
      cursor,
      limit,
    );
  }

  async getManagerSummaryStats(companyId: number): Promise<any> {
    return this.queryService.getManagerSummaryStats(companyId);
  }
}
