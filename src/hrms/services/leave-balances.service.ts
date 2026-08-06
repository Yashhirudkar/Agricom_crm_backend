import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import { LeaveType } from '../models/leave-type.model';
import { Employee } from '../models/employee.model';

@Injectable()
export class LeaveBalancesService {
  constructor(
    @InjectModel(EmployeeLeaveBalance)
    private readonly employeeLeaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(LeaveType)
    private readonly leaveTypeModel: typeof LeaveType,
  ) { }

  async getFallbackEmployeeIdForAdmin(
    companyId: number,
  ): Promise<number | null> {
    const employee = await this.employeeModel.findOne({ where: { companyId } });
    return employee ? employee.id : null;
  }

  async getBalancesForEmployee(
    employeeId: number,
    companyId: number,
    year: number,
  ): Promise<any[]> {
    // 1. Fetch all active leave types for this company
    const activeLeaveTypes = await this.leaveTypeModel.findAll({
      where: { companyId, isActive: true },
      order: [['name', 'ASC']],
    });

    // 2. Fetch existing balance records for this employee for the given year
    const existingBalances = await this.employeeLeaveBalanceModel.findAll({
      where: { employeeId, companyId, year },
      include: [
        {
          model: LeaveType,
          attributes: ['id', 'name', 'code', 'daysPerYear', 'isPaid'],
        },
      ],
    });

    const balanceMap = new Map<number, EmployeeLeaveBalance>();
    for (const bal of existingBalances) {
      balanceMap.set(bal.leaveTypeId, bal);
    }

    // 3. Return balance cards for ALL active leave types of the company
    return activeLeaveTypes.map((leaveType) => {
      const existing = balanceMap.get(leaveType.id);

      const allocated = leaveType.daysPerYear != null
        ? Number(leaveType.daysPerYear)
        : Number(existing?.totalAllocated || 0);

      const used = Number(existing?.usedDays || 0);
      const pending = Number(existing?.pendingDays || 0);
      const carryForward = Number(existing?.carryForwardDays || 0);
      const remaining = Math.max(0, allocated - used - pending + carryForward);

      return {
        id: existing?.id || `lt-${leaveType.id}`,
        companyId,
        employeeId,
        leaveTypeId: leaveType.id,
        year,
        totalAllocated: allocated,
        usedDays: used,
        pendingDays: pending,
        remainingDays: remaining,
        carryForwardDays: carryForward,
        createdAt: existing?.createdAt || new Date(),
        updatedAt: existing?.updatedAt || new Date(),
        leaveType: {
          id: leaveType.id,
          name: leaveType.name,
          code: leaveType.code,
          daysPerYear: leaveType.daysPerYear,
          isPaid: leaveType.isPaid,
        },
      };
    });
  }

  async getBalance(
    employeeId: number,
    leaveTypeId: number,
    companyId: number,
    year: number,
  ): Promise<any> {
    const balance = await this.employeeLeaveBalanceModel.findOne({
      where: { employeeId, leaveTypeId, companyId, year },
      include: [{ model: LeaveType }],
    });

    if (!balance) {
      throw new NotFoundException(
        'Leave balance not found for the specified type and year',
      );
    }

    const json = balance.get({ plain: true });
    const allocated = balance.leaveType && balance.leaveType.daysPerYear != null
      ? Number(balance.leaveType.daysPerYear)
      : Number(balance.totalAllocated || 0);
    const used = Number(balance.usedDays || 0);
    const pending = Number(balance.pendingDays || 0);
    const carryForward = Number(balance.carryForwardDays || 0);
    const remaining = Math.max(0, allocated - used - pending + carryForward);

    return {
      ...json,
      totalAllocated: allocated,
      remainingDays: remaining,
    };
  }
}
