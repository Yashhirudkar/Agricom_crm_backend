import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../models/leave-request.model';
import {
  LeaveApprovalStep,
  ApprovalStepStatus,
} from '../models/leave-approval-step.model';
import { LeaveApprovalLog } from '../models/leave-approval-log.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import { LeaveType } from '../models/leave-type.model';
import { Employee } from '../models/employee.model';
import { User } from '../../users/models/user.model';
import { GetLeaveRequestsFilterDto } from '../dto/leave-requests.dto';

@Injectable()
export class LeaveRequestsQueryService {
  constructor(
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    @InjectModel(LeaveApprovalStep)
    private readonly leaveApprovalStepModel: typeof LeaveApprovalStep,
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
  ) {}

  async getLeaveRequests(
    companyId: number,
    query: GetLeaveRequestsFilterDto,
  ): Promise<{ data: any[]; meta: any }> {
    const where: any = { companyId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.startDate && query.endDate) {
      where.fromDate = { [Op.between]: [query.startDate, query.endDate] };
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await this.leaveRequestModel.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email', 'employeeCode'],
        },
        { model: LeaveType, attributes: ['id', 'name', 'code', 'isPaid'] },
        {
          model: LeaveApprovalStep,
          include: [
            {
              model: Employee,
              as: 'approver',
              attributes: ['id', 'firstName', 'lastName'],
            },
          ],
        },
        {
          model: LeaveApprovalLog,
          include: [
            {
              model: User,
              as: 'performer',
              attributes: ['id', 'name'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    const mappedRows = rows.map((row) => {
      const plainRow = row.get({ plain: true });

      let approverName = null;
      let approverId = null;
      let approvedAt = null;

      if (
        plainRow.status === LeaveRequestStatus.APPROVED ||
        plainRow.status === LeaveRequestStatus.REJECTED
      ) {
        // Source of truth for WHO actually performed the action is the Audit Log
        // because Super Admins might override a step assigned to an Employee.
        const actionLog = plainRow.approvalLogs?.find(
          (log: any) =>
            log.action === 'APPROVED' ||
            log.action === 'REJECTED',
        );

        if (actionLog) {
          approverId = actionLog.performedBy;
          approvedAt = actionLog.createdAt; // The time the log was created is the exact approval time
          if (actionLog.performer) {
            approverName = actionLog.performer.name;
          } else {
            approverName = 'Former User';
          }
        }
      }

      return {
        ...plainRow,
        approverId,
        approverName,
        approvedAt,
      };
    });

    return {
      data: mappedRows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async getLeaveRequestById(
    id: number,
    companyId: number,
  ): Promise<LeaveRequest> {
    const request = await this.leaveRequestModel.findOne({
      where: { id, companyId },
      include: [
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email', 'employeeCode'],
        },
        { model: LeaveType, attributes: ['id', 'name', 'code', 'isPaid'] },
        {
          model: LeaveApprovalStep,
          include: [
            {
              model: Employee,
              as: 'approver',
              attributes: ['id', 'firstName', 'lastName'],
            },
          ],
        },
        { model: LeaveApprovalLog },
      ],
      order: [
        [{ model: LeaveApprovalLog, as: 'logs' } as any, 'createdAt', 'DESC'],
      ],
    });

    if (!request) throw new NotFoundException('Leave request not found');
    return request;
  }

  async getDashboardSummary(
    companyId: number,
    employeeId: number,
  ): Promise<any> {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );

    const pendingApprovals = await this.leaveApprovalStepModel.count({
      where: {
        approverId: employeeId,
        status: ApprovalStepStatus.PENDING,
      },
    });

    const balances = await this.employeeLeaveBalanceModel.findAll({
      where: { employeeId, year: today.getFullYear() },
      include: [{ model: LeaveType, attributes: ['name', 'code'] }],
    });

    const approvedThisMonth = await this.leaveRequestModel.count({
      where: {
        employeeId,
        companyId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.between]: [firstDayOfMonth, lastDayOfMonth] },
      },
    });

    const rejectedCount = await this.leaveRequestModel.count({
      where: {
        employeeId,
        companyId,
        status: LeaveRequestStatus.REJECTED,
        createdAt: { [Op.gte]: new Date(today.getFullYear(), 0, 1) },
      },
    });

    return {
      pendingApprovals,
      balances,
      approvedThisMonth,
      rejectedCount,
    };
  }
}
