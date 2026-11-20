import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { PaymentTermService } from './payment-term.service';
import { PaymentTerm } from './payment-term.model';

describe('PaymentTermService', () => {
  let service: PaymentTermService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      findAll: jest.fn(),
      findAndCountAll: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      bulkCreate: jest.fn(),
      sequelize: {
        transaction: jest.fn().mockResolvedValue({
          commit: jest.fn(),
          rollback: jest.fn(),
        }),
        query: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentTermService,
        {
          provide: getModelToken(PaymentTerm),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<PaymentTermService>(PaymentTermService);
  });

  describe('create', () => {
    it('should throw BadRequestException if name is empty or only whitespace', async () => {
      await expect(service.create({ name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should trim leading/trailing whitespace and auto-generate code and credit days', async () => {
      mockModel.findOne.mockResolvedValue(null);
      mockModel.create.mockImplementation((data) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const res = await service.create({ name: '  30 Days Credit  ' });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '30 Days Credit',
          code: '30_DAYS_CREDIT',
          creditDays: 30,
          status: 'Active',
        }),
      );
      expect(res.name).toBe('30 Days Credit');
    });

    it('should reject duplicate payment term names case-insensitively', async () => {
      mockModel.findOne.mockResolvedValueOnce({
        id: 1,
        name: '30 Days Credit',
        code: '30_DAYS_CREDIT',
      });

      await expect(
        service.create({ name: '30 days credit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should extract credit days from name pattern like "45 Days Credit"', async () => {
      mockModel.findOne.mockResolvedValue(null);
      mockModel.create.mockImplementation((data) =>
        Promise.resolve({ id: 2, ...data }),
      );

      await service.create({ name: '45 Days Credit' });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '45 Days Credit',
          creditDays: 45,
        }),
      );
    });

    it('should use provided code if present and check for duplicates', async () => {
      mockModel.findOne.mockResolvedValue(null);
      mockModel.create.mockImplementation((data) =>
        Promise.resolve({ id: 3, ...data }),
      );

      await service.create({ name: 'LC at Sight', code: 'LC_SIGHT' });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LC at Sight',
          code: 'LC_SIGHT',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should query with status Active by default and return items', async () => {
      mockModel.findAndCountAll.mockResolvedValue({
        rows: [
          { id: 1, name: '30 Days Credit', code: '30_DAYS_CREDIT' },
          { id: 2, name: 'Advance Payment', code: 'ADVANCE' },
        ],
        count: 2,
      });

      const res = await service.findAll({});

      expect(mockModel.findAndCountAll).toHaveBeenCalled();
      expect(res.data).toHaveLength(2);
      expect(res.total).toBe(2);
    });
  });
});
