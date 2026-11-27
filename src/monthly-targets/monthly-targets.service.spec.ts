import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { MonthlyTargetsService } from './monthly-targets.service';
import { MonthlyTarget } from './models/monthly-target.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { NotificationsGateway } from '../notifications/gateways/notifications.gateway';

describe('MonthlyTargetsService', () => {
  let service: MonthlyTargetsService;
  let mockMonthlyTargetModel: any;
  let mockSalesContractModel: any;
  let mockNotificationsGateway: any;

  beforeEach(async () => {
    mockMonthlyTargetModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
    };

    mockSalesContractModel = {
      sequelize: {
        query: jest.fn(),
      },
    };

    mockNotificationsGateway = {
      emitToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyTargetsService,
        {
          provide: getModelToken(MonthlyTarget),
          useValue: mockMonthlyTargetModel,
        },
        {
          provide: getModelToken(SalesContract),
          useValue: mockSalesContractModel,
        },
        {
          provide: NotificationsGateway,
          useValue: mockNotificationsGateway,
        },
      ],
    }).compile();

    service = module.get<MonthlyTargetsService>(MonthlyTargetsService);
  });

  describe('Calculation Logic & Over-Achievement', () => {
    it('should calculate completed, remaining, and progress percentage correctly', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 1,
        userId: 5,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });

      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '180.00' },
      ]);

      const result = await service.getTargetWithStats(5, 11, 2026);

      expect(result.hasTarget).toBe(true);
      expect(result.stats.targetMT).toBe(500);
      expect(result.stats.completedMT).toBe(180);
      expect(result.stats.remainingMT).toBe(320);
      expect(result.stats.progressPercentage).toBe(36);
      expect(result.stats.isOverAchieved).toBe(false);
    });

    it('should NEVER allow Remaining MT to become negative when over-achieved (Section 16)', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 1,
        userId: 5,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });

      // 620 MT completed on a 500 MT target
      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '620.00' },
      ]);

      const result = await service.getTargetWithStats(5, 11, 2026);

      expect(result.hasTarget).toBe(true);
      expect(result.stats.targetMT).toBe(500);
      expect(result.stats.completedMT).toBe(620);
      expect(result.stats.remainingMT).toBe(0); // MUST NEVER BE NEGATIVE
      expect(result.stats.progressPercentage).toBe(124); // Over achievement
      expect(result.stats.isOverAchieved).toBe(true);
    });

    it('should return 0 targetMT and 0 progress when no target is set for the month', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue(null);
      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '50.00' },
      ]);

      const result = await service.getTargetWithStats(5, 11, 2026);

      expect(result.hasTarget).toBe(false);
      expect(result.target).toBeNull();
      expect(result.stats.targetMT).toBe(0);
      expect(result.stats.completedMT).toBe(50);
      expect(result.stats.remainingMT).toBe(0);
      expect(result.stats.progressPercentage).toBe(0);
    });

    it('should NOT consider a target locked or set if targetMT is 0 or isLocked is false', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 2,
        userId: 5,
        month: 12,
        year: 2026,
        targetMT: 0,
        isLocked: true,
      });
      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '0' },
      ]);

      const zeroResult = await service.getTargetWithStats(5, 12, 2026);
      expect(zeroResult.hasTarget).toBe(false);
      expect(zeroResult.target).toBeNull();

      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 3,
        userId: 5,
        month: 12,
        year: 2026,
        targetMT: 500,
        isLocked: false,
      });

      const unlockedResult = await service.getTargetWithStats(5, 12, 2026);
      expect(unlockedResult.hasTarget).toBe(false);
      expect(unlockedResult.target).toBeNull();
    });

    it('should attribute Sales Contracts created from a user Enquiries and subtract Completed from Remaining', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 6,
        userId: 10,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });

      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '185.50' },
      ]);

      const result = await service.getTargetWithStats(10, 11, 2026);

      const [sql, options] = mockSalesContractModel.sequelize.query.mock.calls[0];
      expect(sql).toContain('LEFT JOIN enquiries e ON e.id::text = sc.enquiry_id::text');
      expect(sql).toContain('COALESCE(e.created_by, sc.created_by) = :userId');
      expect(options).toEqual({
        replacements: { userId: 10, month: 11, year: 2026 },
        type: 'SELECT',
      });
      expect(result.stats.targetMT).toBe(500);
      expect(result.stats.completedMT).toBe(185.5);
      expect(result.stats.remainingMT).toBe(314.5);
      expect(result.stats.progressPercentage).toBe(37);
    });
  });

  describe('Target Creation & Locking', () => {
    it('should create a target with isLocked: true and emit websocket event', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue(null);
      mockMonthlyTargetModel.create.mockResolvedValue({
        id: 1,
        userId: 5,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });
      mockSalesContractModel.sequelize.query.mockResolvedValue([
        { completedMT: '0' },
      ]);

      const result = await service.createTarget(5, {
        targetMT: 500,
        month: 11,
        year: 2026,
      });

      expect(mockMonthlyTargetModel.create).toHaveBeenCalledWith({
        userId: 5,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });
      expect(mockNotificationsGateway.emitToUser).toHaveBeenCalledWith(
        5,
        'sales-target:updated',
        expect.objectContaining({ action: 'target_created' }),
      );
    });

    it('should prevent setting target again if a target already exists for that month (Section 6 & 7)', async () => {
      mockMonthlyTargetModel.findOne.mockResolvedValue({
        id: 1,
        userId: 5,
        month: 11,
        year: 2026,
        targetMT: 500,
        isLocked: true,
      });

      await expect(
        service.createTarget(5, { targetMT: 600, month: 11, year: 2026 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

