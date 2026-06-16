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
  ) {}

  async getFallbackEmployeeIdForAdmin(companyId: number): Promise<number | null> {
    const employee = await this.employeeModel.findOne({ where: { companyId } });
    return employee ? employee.id : null;
  }

  async getBalancesForEmployee(employeeId: number, companyId: number, year: number): Promise<EmployeeLeaveBalance[]> {
    return this.employeeLeaveBalanceModel.findAll({
      where: { employeeId, companyId, year },
      include: [
        { model: LeaveType, attributes: ['id', 'name', 'code', 'daysPerYear', 'isPaid'] }
      ]
    });
  }

  async getBalance(employeeId: number, leaveTypeId: number, companyId: number, year: number): Promise<EmployeeLeaveBalance> {
    const balance = await this.employeeLeaveBalanceModel.findOne({
      where: { employeeId, leaveTypeId, companyId, year },
      include: [{ model: LeaveType }]
    });

    if (!balance) {
      throw new NotFoundException('Leave balance not found for the specified type and year');
    }

    return balance;
  }
}
