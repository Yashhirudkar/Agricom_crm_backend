import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Employee } from '../models/employee.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Company } from '../../companies/models/company.model';
import { Shift } from '../../attendance/models/shift.model';

export interface CalculateActualLeaveDaysParams {
  fromDate: string;
  toDate: string;
  companyId: number;
  employeeId: number;
  isHalfDay: boolean;
  weeklyOffDays?: number[];
}

/** Safely parse YYYY-MM-DD string or Date into local noon Date object to prevent timezone shifts */
function parseToNoonDate(dateVal: string | Date): Date {
  const str =
    typeof dateVal === 'string'
      ? dateVal.split('T')[0]
      : new Date(dateVal).toISOString().split('T')[0];
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Format noon Date object back to YYYY-MM-DD */
function formatDateToIsoString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class LeaveCalculationService {
  constructor(
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(HolidayCompany)
    private readonly holidayCompanyModel: typeof HolidayCompany,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(CompanyHrPolicy)
    private readonly hrPolicyModel: typeof CompanyHrPolicy,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
  ) {}

  /**
   * Authoritative Single Source of Truth for Leave-Day Calculation.
   *
   * Resolves weekly off hierarchy:
   * 1. Explicitly provided weeklyOffDays (if array)
   * 2. Employee shift weeklyOffDays (if assigned)
   * 3. Company HR Policy weeklyOffDays (if configured)
   * 4. [0, 6] only as final fallback when neither exists
   *
   * Holiday matching:
   * - Must be active (isActive = true)
   * - Non-optional (isOptional = false) to exclude from leave count
   * - Company-specific if holiday_companies has entries matching companyId
   * - Client-wide if holiday_companies has 0 rows and belongs to same clientId
   */
  async calculateActualLeaveDays(
    params: CalculateActualLeaveDaysParams,
  ): Promise<number> {
    const {
      fromDate,
      toDate,
      companyId,
      employeeId,
      isHalfDay,
    } = params;

    if (isHalfDay) {
      return 0.5;
    }

    const start = parseToNoonDate(fromDate);
    const end = parseToNoonDate(toDate);

    if (start > end) {
      throw new BadRequestException('From date cannot be after To date');
    }

    const fromDateStr = formatDateToIsoString(start);
    const toDateStr = formatDateToIsoString(end);

    // 1. Resolve weeklyOffDays
    let weeklyOffDays = params.weeklyOffDays;
    let employeeClientId: number | null = null;

    if (!Array.isArray(weeklyOffDays)) {
      const employee = await this.employeeModel.findOne({
        where: { id: employeeId },
        include: [{ model: Shift, required: false }],
      });

      if (employee?.shift && Array.isArray(employee.shift.weeklyOffDays)) {
        weeklyOffDays = employee.shift.weeklyOffDays;
      } else {
        const policy = await this.hrPolicyModel.findOne({
          where: { companyId },
        });
        if (policy && Array.isArray(policy.weeklyOffDays)) {
          weeklyOffDays = policy.weeklyOffDays;
        } else {
          weeklyOffDays = [0, 6]; // Final fallback only
        }
      }
    }

    // 2. Fetch company to get clientId for client-wide holiday scope validation
    const company = await this.companyModel.findByPk(companyId, {
      attributes: ['id', 'clientId'],
    });
    employeeClientId = company?.clientId || null;

    // 3. Fetch active holidays in date range
    const holidayWhere: any = {
      isActive: true,
      holidayDate: {
        [Op.between]: [fromDateStr, toDateStr],
      },
    };
    if (employeeClientId) {
      holidayWhere.clientId = employeeClientId;
    }

    const holidays = await this.holidayModel.findAll({
      where: holidayWhere,
      include: [
        {
          model: HolidayCompany,
          required: false,
        },
      ],
    });

    // 4. Filter applicable holidays
    // Preserve existing business rule: only non-optional holidays (isOptional === false) exclude from leave count
    const applicableHolidayDateSet = new Set<string>();

    for (const h of holidays) {
      if (h.isOptional) {
        // Optional holiday remains countable as leave day per existing business rules
        continue;
      }

      let isApplicable = false;
      if (h.holidayCompanies && h.holidayCompanies.length > 0) {
        // Company-specific
        isApplicable = h.holidayCompanies.some(
          (hc) => Number(hc.companyId) === Number(companyId),
        );
      } else {
        // Client-wide holiday (0 rows in holiday_companies)
        isApplicable = true;
      }

      if (isApplicable) {
        const rawDate = h.holidayDate as any;
        const hDateStr =
          typeof rawDate === 'string'
            ? rawDate.split('T')[0]
            : formatDateToIsoString(new Date(rawDate));
        applicableHolidayDateSet.add(hDateStr);
      }
    }

    // 5. Iterate each day from start to end inclusive
    let leaveDaysCount = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat
      const dateString = formatDateToIsoString(current);

      const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
      const isHoliday = applicableHolidayDateSet.has(dateString);

      if (!isWeeklyOff && !isHoliday) {
        leaveDaysCount++;
      }

      current.setDate(current.getDate() + 1);
    }

    return leaveDaysCount;
  }
}
