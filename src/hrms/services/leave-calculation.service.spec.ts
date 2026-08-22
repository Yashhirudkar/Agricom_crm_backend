import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { LeaveCalculationService } from './leave-calculation.service';
import { LeaveRevalidationService } from './leave-revalidation.service';
import { LeaveReconciliationService } from './leave-reconciliation.service';
import { Holiday } from '../../holidays/models/holiday.model';
import { HolidayCompany } from '../../holidays/models/holiday-company.model';
import { Employee } from '../models/employee.model';
import { CompanyHrPolicy } from '../../companies/models/company-hr-policy.model';
import { Company } from '../../companies/models/company.model';
import { Shift } from '../../attendance/models/shift.model';
import { LeaveRequest, LeaveRequestStatus } from '../models/leave-request.model';
import { EmployeeLeaveBalance } from '../models/employee-leave-balance.model';
import { LeaveApprovalLog, LeaveAction } from '../models/leave-approval-log.model';

describe('LeaveCalculationService & Revalidation Suite (T1 - T18)', () => {
  let calculationService: LeaveCalculationService;
  let revalidationService: LeaveRevalidationService;
  let reconciliationService: LeaveReconciliationService;

  // Mock repositories
  let mockHolidayModel: any;
  let mockHolidayCompanyModel: any;
  let mockEmployeeModel: any;
  let mockHrPolicyModel: any;
  let mockCompanyModel: any;
  let mockLeaveRequestModel: any;
  let mockEmployeeLeaveBalanceModel: any;
  let mockLeaveApprovalLogModel: any;

  beforeEach(async () => {
    mockHolidayModel = {
      findAll: jest.fn(),
    };
    mockHolidayCompanyModel = {};
    mockEmployeeModel = {
      findOne: jest.fn(),
      findByPk: jest.fn(),
    };
    mockHrPolicyModel = {
      findOne: jest.fn(),
    };
    mockCompanyModel = {
      findByPk: jest.fn().mockResolvedValue({ id: 1, clientId: 2 }),
      findAll: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };

    const mockTransaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      LOCK: { UPDATE: 'UPDATE' },
    };

    mockLeaveRequestModel = {
      sequelize: {
        transaction: jest.fn().mockResolvedValue(mockTransaction),
      },
      findOne: jest.fn(),
      findAll: jest.fn(),
    };

    mockEmployeeLeaveBalanceModel = {
      findOne: jest.fn(),
    };

    mockLeaveApprovalLogModel = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveCalculationService,
        LeaveRevalidationService,
        LeaveReconciliationService,
        { provide: getModelToken(Holiday), useValue: mockHolidayModel },
        { provide: getModelToken(HolidayCompany), useValue: mockHolidayCompanyModel },
        { provide: getModelToken(Employee), useValue: mockEmployeeModel },
        { provide: getModelToken(CompanyHrPolicy), useValue: mockHrPolicyModel },
        { provide: getModelToken(Company), useValue: mockCompanyModel },
        { provide: getModelToken(LeaveRequest), useValue: mockLeaveRequestModel },
        { provide: getModelToken(EmployeeLeaveBalance), useValue: mockEmployeeLeaveBalanceModel },
        { provide: getModelToken(LeaveApprovalLog), useValue: mockLeaveApprovalLogModel },
      ],
    }).compile();

    calculationService = module.get<LeaveCalculationService>(LeaveCalculationService);
    revalidationService = module.get<LeaveRevalidationService>(LeaveRevalidationService);
    reconciliationService = module.get<LeaveReconciliationService>(LeaveReconciliationService);
  });

  // ─── T1: Current case (24 Aug - 1 Sep 2026, weeklyOff=[0], 28 Aug Rakshabandhan) ───
  it('T1: should calculate exactly 7 days for 24 Aug - 1 Sep with weeklyOff=[0] and 28 Aug holiday', async () => {
    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        title: 'Rakshabandhan',
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [], // client-wide
      },
    ]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0], // Sunday only
    });

    expect(result).toBe(7);
  });

  // ─── T2: Saturday working day with weeklyOff=[0] ───────────────────────────
  it('T2: Saturday (29 Aug 2026) must count as working day when weeklyOff=[0]', async () => {
    mockHolidayModel.findAll.mockResolvedValue([]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-29',
      toDate: '2026-08-29',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    expect(result).toBe(1);
  });

  // ─── T3: Sunday weekly off with weeklyOff=[0] ──────────────────────────────
  it('T3: Sunday (30 Aug 2026) must NOT count when weeklyOff=[0]', async () => {
    mockHolidayModel.findAll.mockResolvedValue([]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-30',
      toDate: '2026-08-30',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    expect(result).toBe(0);
  });

  // ─── T4: Holiday added after leave application (8 -> 7) ───────────────────
  it('T4: Holiday added after leave application revalidates leave from 8 to 7 days', async () => {
    const mockLeave = {
      id: 8,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 8.0,
      status: LeaveRequestStatus.PENDING,
      isHalfDay: false,
      update: jest.fn().mockResolvedValue(true),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    const mockBalance = {
      employeeId: 55,
      leaveTypeId: 2,
      pendingDays: 8.0,
      usedDays: 0.0,
      remainingDays: 4.0,
      update: jest.fn().mockResolvedValue(true),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    // Holiday now exists in DB
    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [],
      },
    ]);
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(8, 4, 7, 'Rakshabandhan', 'CREATED');

    expect(res.status).toBe('UPDATED');
    expect(mockLeave.update).toHaveBeenCalledWith(
      { totalDays: 7 },
      expect.any(Object),
    );
    expect(mockBalance.update).toHaveBeenCalledWith(
      { pendingDays: 7, remainingDays: 5 },
      expect.any(Object),
    );
    expect(mockLeaveApprovalLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leaveRequestId: 8,
        action: LeaveAction.RECALCULATED,
      }),
      expect.any(Object),
    );
  });

  // ─── T5: Holiday added after approval (usedDays -1, remainingDays +1) ──────
  it('T5: Holiday added after approval decreases usedDays and increases remainingDays', async () => {
    const mockLeave = {
      id: 8,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 8.0,
      status: LeaveRequestStatus.APPROVED,
      isHalfDay: false,
      update: jest.fn().mockResolvedValue(true),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    const mockBalance = {
      employeeId: 55,
      leaveTypeId: 2,
      pendingDays: 0.0,
      usedDays: 8.0,
      remainingDays: 4.0,
      update: jest.fn().mockResolvedValue(true),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [],
      },
    ]);
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(8, 4, 7, 'Rakshabandhan', 'CREATED');

    expect(res.status).toBe('UPDATED');
    expect(mockLeave.update).toHaveBeenCalledWith({ totalDays: 7 }, expect.any(Object));
    expect(mockBalance.update).toHaveBeenCalledWith({ usedDays: 7, remainingDays: 5 }, expect.any(Object));
  });

  // ─── T6: Holiday removed (7 -> 8, balance reverses) ────────────────────────
  it('T6: Holiday removed reverses totalDays from 7 to 8 and updates balance', async () => {
    const mockLeave = {
      id: 8,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 7.0,
      status: LeaveRequestStatus.APPROVED,
      isHalfDay: false,
      update: jest.fn().mockResolvedValue(true),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    const mockBalance = {
      employeeId: 55,
      leaveTypeId: 2,
      usedDays: 7.0,
      remainingDays: 5.0,
      update: jest.fn().mockResolvedValue(true),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    // Holiday removed (no holiday returned)
    mockHolidayModel.findAll.mockResolvedValue([]);
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(8, 4, 7, 'Rakshabandhan', 'DELETED');

    expect(res.status).toBe('UPDATED');
    expect(mockLeave.update).toHaveBeenCalledWith({ totalDays: 8 }, expect.any(Object));
    expect(mockBalance.update).toHaveBeenCalledWith({ usedDays: 8, remainingDays: 4 }, expect.any(Object));
  });

  // ─── T7: Holiday outside leave range ──────────────────────────────────────
  it('T7: Holiday outside leave range does not affect leave request days', async () => {
    mockHolidayModel.findAll.mockResolvedValue([]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-05',
      toDate: '2026-08-10',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    // 5 Aug (Wed) to 10 Aug (Mon) = 6 calendar days, 1 Sunday (9 Aug) = 5 working days
    expect(result).toBe(5);
  });

  // ─── T8: Company-specific holiday for another company ──────────────────────
  it('T8: Company-specific holiday for Company 2 must NOT exclude days for Company 1', async () => {
    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 99,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [{ companyId: 2 }], // Only Company 2
      },
    ]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      companyId: 1, // Priya is in Company 1
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    // 28 Aug is NOT a holiday for Company 1 -> 8 days
    expect(result).toBe(8);
  });

  // ─── T9: Client-wide holiday ──────────────────────────────────────────────
  it('T9: Client-wide holiday (holiday_companies empty) applies to all companies', async () => {
    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [], // 0 rows => client-wide
      },
    ]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    expect(result).toBe(7);
  });

  // ─── T10: Idempotency (run twice: 8->7 first, 7->7 second) ────────────────
  it('T10: Idempotent recalculation: second run produces zero balance change', async () => {
    const mockLeave = {
      id: 8,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 7.0, // Already 7
      status: LeaveRequestStatus.APPROVED,
      isHalfDay: false,
      update: jest.fn(),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    const mockBalance = {
      usedDays: 7.0,
      remainingDays: 5.0,
      update: jest.fn(),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [],
      },
    ]);
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(8, 4, 7, 'Rakshabandhan', 'UPDATED');

    expect(res.status).toBe('SKIPPED');
    expect(mockLeave.update).not.toHaveBeenCalled();
    expect(mockBalance.update).not.toHaveBeenCalled();
    expect(mockLeaveApprovalLogModel.create).not.toHaveBeenCalled();
  });

  // ─── T11: Pending leave balance adjustment ────────────────────────────────
  it('T11: Pending leave decreases pendingDays and increases remainingDays', async () => {
    const mockLeave = {
      id: 12,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 8.0,
      status: LeaveRequestStatus.PENDING,
      isHalfDay: false,
      update: jest.fn().mockResolvedValue(true),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    const mockBalance = {
      pendingDays: 8.0,
      remainingDays: 4.0,
      usedDays: 0.0,
      update: jest.fn().mockResolvedValue(true),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 7,
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: false,
        holidayCompanies: [],
      },
    ]);
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(12, 4, 7, 'Rakshabandhan', 'CREATED');

    expect(res.status).toBe('UPDATED');
    expect(mockBalance.update).toHaveBeenCalledWith(
      { pendingDays: 7, remainingDays: 5 },
      expect.any(Object),
    );
  });

  // ─── T12: Half day leave calculation ──────────────────────────────────────
  it('T12: Half-day leave always calculates as 0.5 days', async () => {
    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-25',
      toDate: '2026-08-25',
      companyId: 1,
      employeeId: 55,
      isHalfDay: true,
    });

    expect(result).toBe(0.5);
  });

  // ─── T13: Holiday date changed event (revalidates affected range) ─────────
  it('T13: Holiday date changed triggers revalidation for both old and new date ranges', async () => {
    mockLeaveRequestModel.findAll.mockResolvedValue([
      {
        id: 8,
        employeeId: 55,
        companyId: 1,
        fromDate: '2026-08-24',
        toDate: '2026-09-01',
        totalDays: 8.0,
        status: LeaveRequestStatus.PENDING,
        isHalfDay: false,
      },
    ]);

    const spy = jest.spyOn(revalidationService, 'recalculateSingleLeave').mockResolvedValue({ status: 'UPDATED' });

    const result = await revalidationService.revalidateAffectedLeaves({
      action: 'UPDATED',
      clientId: 2,
      affectedDates: ['2026-08-28', '2026-08-29'],
      affectedCompanyIds: null,
      triggeredBy: 4,
      holidayId: 7,
    });

    expect(result.inspected).toBe(1);
    expect(result.updated).toBe(1);
    expect(spy).toHaveBeenCalledWith(8, 4, 7, undefined, 'UPDATED');
  });

  // ─── T14: Holiday company scope changed ───────────────────────────────────
  it('T14: Holiday company scope targeting matches only affected company IDs', async () => {
    mockLeaveRequestModel.findAll.mockResolvedValue([]);

    const result = await revalidationService.revalidateAffectedLeaves({
      action: 'UPDATED',
      clientId: 2,
      affectedDates: ['2026-08-28'],
      affectedCompanyIds: [1, 2],
      triggeredBy: 4,
      holidayId: 7,
    });

    expect(mockLeaveRequestModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: expect.any(Object),
        }),
      }),
    );
    expect(result.inspected).toBe(0);
  });

  // ─── T15: Optional holiday is NOT excluded (existing business rule) ───────
  it('T15: isOptional=true holiday remains countable as a leave day', async () => {
    mockHolidayModel.findAll.mockResolvedValue([
      {
        id: 15,
        title: 'Optional Festival',
        holidayDate: '2026-08-28',
        isActive: true,
        isOptional: true, // Optional!
        holidayCompanies: [],
      },
    ]);

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      weeklyOffDays: [0],
    });

    // Optional holiday is NOT excluded -> 8 days
    expect(result).toBe(8);
  });

  // ─── T16: Transaction failure / invalid balance rolls back ────────────────
  it('T16: Invalid balance calculation rolls back transaction and returns error', async () => {
    const mockLeave = {
      id: 8,
      employeeId: 55,
      companyId: 1,
      leaveTypeId: 2,
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      totalDays: 5.0, // Stale low number
      status: LeaveRequestStatus.APPROVED,
      isHalfDay: false,
      update: jest.fn(),
    };
    mockLeaveRequestModel.findOne.mockResolvedValue(mockLeave);

    // Remaining days would go negative if difference +3 is deducted from 1
    const mockBalance = {
      usedDays: 5.0,
      remainingDays: 0.0, // not enough remaining
      update: jest.fn(),
    };
    mockEmployeeLeaveBalanceModel.findOne.mockResolvedValue(mockBalance);

    mockHolidayModel.findAll.mockResolvedValue([]); // recalculates to 8 (+3 diff)
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const res = await revalidationService.recalculateSingleLeave(8, 4, 7, 'Holiday', 'UPDATED');

    expect(res.status).toBe('ERROR');
    expect(res.message).toContain('Invalid resulting balance');
  });

  // ─── T17: Shift weekly off takes precedence over HR policy ────────────────
  it('T17: Employee shift weeklyOffDays overrides company HR policy', async () => {
    mockHolidayModel.findAll.mockResolvedValue([]);

    // Employee has Shift with [0, 6] (Sat + Sun off)
    mockEmployeeModel.findOne.mockResolvedValue({
      id: 55,
      shift: { weeklyOffDays: [0, 6] },
    });

    // HR Policy has only [0] (Sun off)
    mockHrPolicyModel.findOne.mockResolvedValue({ weeklyOffDays: [0] });

    const result = await calculationService.calculateActualLeaveDays({
      fromDate: '2026-08-24',
      toDate: '2026-09-01',
      companyId: 1,
      employeeId: 55,
      isHalfDay: false,
      // weeklyOffDays not provided directly -> resolves from employee shift
    });

    // 9 calendar days - 1 Sun - 1 Sat = 7 days (shift [0,6] took precedence)
    expect(result).toBe(7);
  });

  // ─── T18: Daily reconciliation safety net ─────────────────────────────────
  it('T18: Daily reconciliation inspects active leaves and updates discrepant ones', async () => {
    mockLeaveRequestModel.findAll.mockResolvedValue([{ id: 101 }, { id: 102 }]);

    const spy = jest.spyOn(revalidationService, 'recalculateSingleLeave')
      .mockResolvedValueOnce({ status: 'UPDATED' })
      .mockResolvedValueOnce({ status: 'SKIPPED' });

    const stats = await reconciliationService.reconcileActiveLeaves(1);

    expect(stats.inspected).toBe(2);
    expect(stats.updated).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
