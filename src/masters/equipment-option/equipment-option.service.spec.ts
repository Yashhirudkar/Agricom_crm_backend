import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { EquipmentOptionService } from './equipment-option.service';
import { EquipmentOption } from './equipment-option.model';

describe('EquipmentOptionService', () => {
  let service: EquipmentOptionService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      max: jest.fn().mockResolvedValue(10),
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
        EquipmentOptionService,
        {
          provide: getModelToken(EquipmentOption),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<EquipmentOptionService>(EquipmentOptionService);
  });

  describe('create', () => {
    it('should normalize pure number capacity "22" to "22 MT" and save', async () => {
      mockModel.findAll.mockResolvedValue([]);
      mockModel.create.mockImplementation((data) => Promise.resolve({ id: 101, ...data }));

      const res = await service.create({ category: 'TRUCK_CAPACITY', value: '22' });
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'TRUCK_CAPACITY',
          value: '22 MT',
        }),
      );
      expect(res.value).toBe('22 MT');
    });

    it('should normalize "22 mt" or "22MT" to "22 MT"', async () => {
      mockModel.findAll.mockResolvedValue([]);
      mockModel.create.mockImplementation((data) => Promise.resolve({ id: 102, ...data }));

      await service.create({ category: 'TRUCK_CAPACITY', value: '22 mt' });
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'TRUCK_CAPACITY',
          value: '22 MT',
        }),
      );
    });

    it('should NOT create duplicate when normalized value already exists, but return existing record', async () => {
      const existingOption = { id: 5, category: 'TRUCK_CAPACITY', value: '22 MT' };
      mockModel.findAll.mockResolvedValue([existingOption]);

      // Attempt to create "22" when "22 MT" exists
      const res = await service.create({ category: 'TRUCK_CAPACITY', value: '22' });
      expect(mockModel.create).not.toHaveBeenCalled();
      expect(res).toBe(existingOption);
      expect(res.value).toBe('22 MT');
    });

    it('should ignore case and extra spaces when checking duplicates', async () => {
      const existingOption = { id: 5, category: 'TRUCK_CAPACITY', value: '22 MT' };
      mockModel.findAll.mockResolvedValue([existingOption]);

      // Attempt to create "  22   mt  "
      const res = await service.create({ category: 'TRUCK_CAPACITY', value: '  22   mt  ' });
      expect(mockModel.create).not.toHaveBeenCalled();
      expect(res).toBe(existingOption);
    });
  });

  describe('findAll', () => {
    it('should normalize, deduplicate, and numerically sort TRUCK_CAPACITY options', async () => {
      mockModel.findAll.mockResolvedValue([
        { id: 1, category: 'TRUCK_CAPACITY', value: '40 MT' },
        { id: 2, category: 'TRUCK_CAPACITY', value: '22' },
        { id: 3, category: 'TRUCK_CAPACITY', value: '22 MT' },
        { id: 4, category: 'TRUCK_CAPACITY', value: '10 MT' },
        { id: 5, category: 'TRUCK_CAPACITY', value: '22 mt' },
        { id: 6, category: 'TRUCK_CAPACITY', value: '5 MT' },
      ]);

      const result = await service.findAll('TRUCK_CAPACITY');
      expect(result.map((r) => r.value)).toEqual([
        '5 MT',
        '10 MT',
        '22 MT',
        '40 MT',
      ]);
      expect(result.length).toBe(4);
    });
  });
});
