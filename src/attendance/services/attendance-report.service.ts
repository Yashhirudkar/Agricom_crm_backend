import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceState,
} from '../models/attendance-record.model';
import { AttendanceLog } from '../models/attendance-log.model';
import {
  AttendanceException,
  AttendanceExceptionStatus,
} from '../models/attendance-exception.model';
import { Shift } from '../models/shift.model';
import { Employee } from '../../hrms/models/employee.model';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../../hrms/models/leave-request.model';
import { Branch } from '../../hrms/models/branch.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Op } from 'sequelize';
import { User } from '../../users/models/user.model';
import { Designation } from '../../hrms/models/designation.model';
import { AttendanceHelperService } from './attendance-helper.service';
import { AttendanceSummaryService } from './attendance-summary.service';

@Injectable()
export class AttendanceReportService {
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
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(LeaveRequest)
    private readonly leaveRequestModel: typeof LeaveRequest,
    private readonly helperService: AttendanceHelperService,
    private readonly summaryService: AttendanceSummaryService,
  ) {}

  // 8. Get Own Attendance (Self)
  async getMyAttendance(
    employeeId: number,
    companyId: number,
    filters: { startDate?: string; endDate?: string },
  ): Promise<any> {
    const whereClause: any = { employeeId, companyId };

    if (filters.startDate || filters.endDate) {
      whereClause.date = {};
      if (filters.startDate) {
        whereClause.date[Op.gte] = filters.startDate;
      }
      if (filters.endDate) {
        whereClause.date[Op.lte] = filters.endDate;
      }
    }

    if (filters.startDate || filters.endDate) {
      const activeLeaves = await this.leaveRequestModel.findAll({
        where: {
          employeeId,
          companyId,
          status: LeaveRequestStatus.APPROVED,
          [Op.or]: [
            {
              fromDate: {
                [Op.between]: [
                  filters.startDate || '1970-01-01',
                  filters.endDate || '9999-12-31',
                ],
              },
            },
            {
              toDate: {
                [Op.between]: [
                  filters.startDate || '1970-01-01',
                  filters.endDate || '9999-12-31',
                ],
              },
            },
            {
              fromDate: { [Op.lte]: filters.startDate || '1970-01-01' },
              toDate: { [Op.gte]: filters.endDate || '9999-12-31' },
            },
          ],
        },
      });

      const requiredDates = new Set<string>();
      for (const leave of activeLeaves) {
        const leaveFromTime = new Date(leave.fromDate).getTime();
        const filterStartTime = new Date(
          filters.startDate || '1970-01-01',
        ).getTime();
        const start = new Date(
          leaveFromTime > filterStartTime
            ? leave.fromDate
            : filters.startDate || '1970-01-01',
        );

        const leaveToTime = new Date(leave.toDate).getTime();
        const filterEndTime = new Date(
          filters.endDate || '9999-12-31',
        ).getTime();
        const end = new Date(
          leaveToTime < filterEndTime
            ? leave.toDate
            : filters.endDate || '9999-12-31',
        );
        const curr = new Date(start);
        while (curr <= end) {
          requiredDates.add(
            curr.toLocaleDateString('en-CA', { timeZone: 'UTC' }),
          );
          curr.setDate(curr.getDate() + 1);
        }
      }

      const records = await this.recordModel.findAll({
        where: whereClause,
        include: [
          Shift,
          {
            model: AttendanceLog,
            as: 'logs',
            required: false,
          },
        ],
        order: [['date', 'DESC']],
      });

      const recordDates = new Set(records.map((r) => r.date));
      const mergedRecords = [...records];

      for (const dStr of requiredDates) {
        if (!recordDates.has(dStr)) {
          const matchedLeave = (activeLeaves as any[]).find((l: any) => {
            const fromStr = typeof l.fromDate === 'string' ? l.fromDate.split('T')[0] : new Date(l.fromDate).toISOString().split('T')[0];
            const toStr = typeof l.toDate === 'string' ? l.toDate.split('T')[0] : new Date(l.toDate).toISOString().split('T')[0];
            return fromStr <= dStr && toStr >= dStr;
          });
          const status = matchedLeave?.isHalfDay ? AttendanceStatus.HALF_DAY : AttendanceStatus.ON_LEAVE;

          const transientRecord = this.recordModel.build({
            employeeId,
            companyId,
            date: dStr,
            attendanceStatus: status,
            attendanceState: AttendanceState.NOT_CHECKED_IN,
            totalHours: 0,
            overtimeHours: 0,
            lateMinutes: 0,
            shiftId: null,
            logs: [],
          } as any);
          mergedRecords.push(transientRecord);
        }
      }

      mergedRecords.sort((a, b) => b.date.localeCompare(a.date));
      return mergedRecords;
    }

    const records = await this.recordModel.findAll({
      where: whereClause,
      include: [
        Shift,
        {
          model: AttendanceLog,
          as: 'logs',
          required: false,
        },
      ],
      order: [['date', 'DESC']],
    });

    return records;
  }

  // 9. Get Company Attendance
  async getCompanyAttendance(
    companyId: number,
    filters: { date?: string; employeeId?: number },
  ): Promise<any> {
    const whereClause: any = { companyId };

    if (filters.date) {
      whereClause.date = filters.date;
    }
    if (filters.employeeId) {
      whereClause.employeeId = filters.employeeId;
    }

    let mergedRecords: AttendanceRecord[] = [];

    if (filters.date) {
      const activeLeaves = await this.leaveRequestModel.findAll({
        where: {
          companyId,
          status: LeaveRequestStatus.APPROVED,
          fromDate: { [Op.lte]: filters.date },
          toDate: { [Op.gte]: filters.date },
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        },
      });

      const records = await this.recordModel.findAll({
        where: whereClause,
        include: [
          {
            model: Employee,
            include: [Branch],
          },
          Shift,
        ],
        order: [
          ['date', 'DESC'],
          ['employeeId', 'ASC'],
        ],
      });

      const recordEmpIds = new Set(records.map((r) => r.employeeId));
      mergedRecords = [...records];

      for (const leave of activeLeaves) {
        if (!recordEmpIds.has(leave.employeeId)) {
          const status = leave.isHalfDay ? AttendanceStatus.HALF_DAY : AttendanceStatus.ON_LEAVE;
          const transientRecord = this.recordModel.build({
            employeeId: leave.employeeId,
            companyId,
            date: filters.date,
            attendanceStatus: status,
            attendanceState: AttendanceState.NOT_CHECKED_IN,
            totalHours: 0,
            overtimeHours: 0,
            lateMinutes: 0,
            shiftId: null,
            employee: leave.employee,
          } as any);
          mergedRecords.push(transientRecord);
        }
      }
    } else {
      mergedRecords = await this.recordModel.findAll({
        where: whereClause,
        include: [
          {
            model: Employee,
            include: [Branch],
          },
          Shift,
        ],
        order: [
          ['date', 'DESC'],
          ['employeeId', 'ASC'],
        ],
      });
    }

    const summary = this.summaryService.buildCompanyDailySummary(mergedRecords);
    return {
      records: mergedRecords,
      summary,
    };
  }

  // 10. Monthly Attendance Report
  async getMonthlyReport(
    companyId: number,
    query: { month: number; year: number; employeeId?: number; page?: number; limit?: number },
  ): Promise<any> {
    // Pagination support
    const page = query.page ? parseInt(query.page as any, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as any, 10) : undefined;

    const employeeWhere: any = { companyId };
    if (query.employeeId) {
      employeeWhere.id = query.employeeId;
    }

    let employees: Employee[];
    let totalEmployees = 0;

    if (page !== undefined && limit !== undefined) {
      const offset = (page - 1) * limit;
      const { count, rows } = await this.employeeModel.findAndCountAll({
        where: employeeWhere,
        include: [Branch],
        limit,
        offset,
        order: [['id', 'ASC']],
      });
      employees = rows;
      totalEmployees = count;
    } else {
      employees = await this.employeeModel.findAll({
        where: employeeWhere,
        include: [Branch],
        order: [['id', 'ASC']],
      });
      totalEmployees = employees.length;
    }

    if (employees.length === 0) {
      if (page !== undefined && limit !== undefined) {
        return {
          data: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        };
      }
      return [];
    }

    const result = [];
    for (const employee of employees) {
      const summaryResult = await this.summaryService.getEmployeeMonthlySummary(
        companyId,
        employee.id,
        query.year,
        query.month,
      );
      result.push({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        summary: summaryResult.summary,
        days: summaryResult.days,
      });
    }

    if (page !== undefined && limit !== undefined) {
      return {
        data: result,
        pagination: {
          total: totalEmployees,
          page,
          limit,
          totalPages: Math.ceil(totalEmployees / limit),
        },
      };
    }

    return result;
  }
}
