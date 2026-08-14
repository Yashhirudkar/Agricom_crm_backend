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
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
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
    if (query.leaveTypeId) where.leaveTypeId = query.leaveTypeId;

    // Date range filter
    if (query.startDate && query.endDate) {
      where.fromDate = { [Op.between]: [query.startDate, query.endDate] };
    }

    // Month filter: derive start/end dates from YYYY-MM string
    if (query.month && !where.fromDate) {
      const [year, month] = query.month.split('-').map(Number);
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
      where.fromDate = { [Op.between]: [firstDay, lastDay] };
    }

    // Filter by department or branch (via employee)
    if (query.departmentId || query.branchId) {
      const empWhere: any = { companyId };
      if (query.departmentId) empWhere.departmentId = query.departmentId;
      if (query.branchId) empWhere.branchId = query.branchId;
      const matchingEmployees = await Employee.findAll({
        where: empWhere,
        attributes: ['id'],
      });
      const empIds = matchingEmployees.map((e) => e.id);
      where.employeeId = empIds.length > 0 ? { [Op.in]: empIds } : { [Op.in]: [-1] };
    }

    // Filter by search query (employee firstName, lastName, employeeCode, email)
    if (query.search) {
      const searchPattern = `%${query.search}%`;
      const matchingEmployees = await Employee.findAll({
        where: {
          companyId,
          [Op.or]: [
            { firstName: { [Op.iLike]: searchPattern } },
            { lastName: { [Op.iLike]: searchPattern } },
            { employeeCode: { [Op.iLike]: searchPattern } },
            { email: { [Op.iLike]: searchPattern } },
          ],
        },
        attributes: ['id'],
      });
      const searchEmpIds = matchingEmployees.map((e) => e.id);

      if (where.employeeId) {
        if (typeof where.employeeId === 'number') {
          if (!searchEmpIds.includes(where.employeeId)) {
            where.employeeId = -1;
          }
        } else if (where.employeeId[Op.in]) {
          const intersected = where.employeeId[Op.in].filter((id) => searchEmpIds.includes(id));
          where.employeeId = intersected.length > 0 ? { [Op.in]: intersected } : { [Op.in]: [-1] };
        }
      } else {
        where.employeeId = searchEmpIds.length > 0 ? { [Op.in]: searchEmpIds } : { [Op.in]: [-1] };
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
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

    const rawBalances = await this.employeeLeaveBalanceModel.findAll({
      where: { employeeId, year: today.getFullYear() },
      include: [{ model: LeaveType, attributes: ['id', 'name', 'code', 'daysPerYear'] }],
    });

    const balances = rawBalances.map((bal) => {
      const json = bal.get({ plain: true });
      const allocated = bal.leaveType && bal.leaveType.daysPerYear != null
        ? Number(bal.leaveType.daysPerYear)
        : Number(bal.totalAllocated || 0);
      const used = Number(bal.usedDays || 0);
      const pending = Number(bal.pendingDays || 0);
      const carryForward = Number(bal.carryForwardDays || 0);
      const remaining = Math.max(0, allocated - used - pending + carryForward);

      return {
        ...json,
        totalAllocated: allocated,
        remainingDays: remaining,
      };
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

  async getMonthlyLeaveSummary(
    companyId: number,
    query: { month?: string; year?: number; departmentId?: number; branchId?: number; page?: number; limit?: number },
  ): Promise<any> {
    const now = new Date();
    let year = query.year || now.getFullYear();
    let month = now.getMonth() + 1; // 1 - 12

    if (query.month) {
      const parts = query.month.split('-');
      if (parts.length === 2) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    }

    const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(year, month, 0);
    const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthLabel = `${monthNames[month - 1]} ${year}`;

    // Filter employees by company + optional department/branch
    const empWhere: any = { companyId };
    if (query.departmentId) empWhere.departmentId = query.departmentId;
    if (query.branchId) empWhere.branchId = query.branchId;

    const employees = await Employee.findAll({
      where: empWhere,
      attributes: ['id', 'firstName', 'lastName', 'email', 'employeeCode'],
      include: [
        { model: Department, as: 'department', required: false, attributes: ['id', 'name'] },
        { model: Designation, as: 'designation', required: false, attributes: ['id', 'name'] },
      ],
      order: [['firstName', 'ASC']],
    });

    const empIds = employees.map((e) => e.id);

    // Fetch leave requests in the selected month range
    const monthLeaves = await this.leaveRequestModel.findAll({
      where: {
        companyId,
        employeeId: { [Op.in]: empIds.length > 0 ? empIds : [-1] },
        fromDate: { [Op.lte]: lastDayStr },
        toDate: { [Op.gte]: firstDayStr },
      },
      include: [
        { model: LeaveType, attributes: ['id', 'name', 'code'] },
      ],
    });

    // Today's leave check
    const todayLeaves = await this.leaveRequestModel.findAll({
      where: {
        companyId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { [Op.lte]: todayStr },
        toDate: { [Op.gte]: todayStr },
      },
      attributes: ['employeeId'],
    });

    const employeesOnLeaveTodayCount = new Set(todayLeaves.map((l) => l.employeeId)).size;

    // Aggregations
    let totalRequests = 0;
    let approvedLeaves = 0;
    let pendingApprovals = 0;
    let rejectedLeaves = 0;
    let totalLeaveDaysTaken = 0;

    // Per-employee statistics map
    const empMap = new Map<number, {
      thisMonthDays: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      lastLeaveDate: string | null;
      leaveTypesUsed: { [key: string]: number };
    }>();

    employees.forEach((emp) => {
      empMap.set(emp.id, {
        thisMonthDays: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        lastLeaveDate: null,
        leaveTypesUsed: {},
      });
    });

    for (const req of monthLeaves) {
      totalRequests++;
      const stats = empMap.get(req.employeeId);

      if (req.status === LeaveRequestStatus.APPROVED) {
        approvedLeaves++;
        totalLeaveDaysTaken += Number(req.totalDays || 0);

        if (stats) {
          stats.approvedCount++;
          stats.thisMonthDays += Number(req.totalDays || 0);
          
          const rawFromDate: any = (req as any).fromDate;
          const reqFromDateStr = typeof rawFromDate === 'string' ? rawFromDate.split('T')[0] : new Date(rawFromDate).toISOString().split('T')[0];
          if (!stats.lastLeaveDate || reqFromDateStr > stats.lastLeaveDate) {
            stats.lastLeaveDate = reqFromDateStr;
          }

          const typeName = req.leaveType?.name || 'Leave';
          stats.leaveTypesUsed[typeName] = (stats.leaveTypesUsed[typeName] || 0) + Number(req.totalDays || 0);
        }
      } else if (req.status === LeaveRequestStatus.PENDING) {
        pendingApprovals++;
        if (stats) stats.pendingCount++;
      } else if (req.status === LeaveRequestStatus.REJECTED) {
        rejectedLeaves++;
        if (stats) stats.rejectedCount++;
      }
    }

    // Fetch yearly balances for employees
    const yearlyBalances = await this.employeeLeaveBalanceModel.findAll({
      where: {
        companyId,
        year,
        employeeId: { [Op.in]: empIds.length > 0 ? empIds : [-1] },
      },
    });

    const balanceMap = new Map<number, { used: number; allocated: number }>();
    yearlyBalances.forEach((b) => {
      const current = balanceMap.get(b.employeeId) || { used: 0, allocated: 0 };
      current.used += Number(b.usedDays || 0);
      current.allocated += Number(b.totalAllocated || 0);
      balanceMap.set(b.employeeId, current);
    });

    // Build employee summaries array
    const allEmployeeSummaries = employees.map((emp) => {
      const stats = empMap.get(emp.id) || {
        thisMonthDays: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        lastLeaveDate: null,
        leaveTypesUsed: {},
      };

      const bal = balanceMap.get(emp.id) || { used: 0, allocated: 24 };
      const yearlyAllocated = bal.allocated > 0 ? bal.allocated : 24;
      const yearlyUsed = bal.used;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeCode: emp.employeeCode,
        departmentName: (emp as any).department?.name || null,
        designationName: (emp as any).designation?.name || null,
        avatarUrl: (emp as any).avatarUrl || (emp as any).avatar || null,
        thisMonthDays: stats.thisMonthDays,
        approvedCount: stats.approvedCount,
        pendingCount: stats.pendingCount,
        rejectedCount: stats.rejectedCount,
        lastLeaveDate: stats.lastLeaveDate,
        leaveTypesUsed: stats.leaveTypesUsed,
        yearlyUsedDays: yearlyUsed,
        yearlyAllocatedDays: yearlyAllocated,
      };
    });

    // Filter to ONLY include employees who have leave requests/activity in the selected month
    const employeeSummaries = allEmployeeSummaries.filter(
      (emp) => emp.thisMonthDays > 0 || emp.approvedCount > 0 || emp.pendingCount > 0 || emp.rejectedCount > 0
    );

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const totalCount = employeeSummaries.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedSummaries = employeeSummaries.slice(offset, offset + limit);

    return {
      monthLabel,
      selectedMonth: `${year}-${String(month).padStart(2, '0')}`,
      summaryCards: {
        employeesOnLeaveToday: employeesOnLeaveTodayCount,
        totalRequests,
        approvedLeaves,
        pendingApprovals,
        rejectedLeaves,
        totalLeaveDaysTaken,
      },
      employeeSummaries: paginatedSummaries,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
    };
  }
}
