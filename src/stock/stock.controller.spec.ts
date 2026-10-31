import { Test, TestingModule } from '@nestjs/testing';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { QueryStockDto } from './dto/query-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

describe('StockController', () => {
  let controller: StockController;
  let mockStockService: any;

  beforeEach(async () => {
    mockStockService = {
      getDashboardSummary: jest.fn().mockResolvedValue({
        totalCountries: 2,
        totalProducts: 4,
        totalPurchaseContracts: 6,
        totalPurchasedMT: 500,
      }),
      getStockList: jest.fn().mockResolvedValue({
        data: [
          {
            country: 'Kazakhstan',
            totalPurchased: 320,
            products: [],
          },
        ],
        totalCount: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        {
          provide: StockService,
          useValue: mockStockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StockController>(StockController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return dashboard summary cards', async () => {
      const req = { user: { companyId: 1 } };
      const result = await controller.getDashboard(req);

      expect(mockStockService.getDashboardSummary).toHaveBeenCalledWith(1);
      expect(result.totalCountries).toBe(2);
      expect(result.totalPurchasedMT).toBe(500);
    });
  });

  describe('getStockList', () => {
    it('should return hierarchical stock list and set pagination headers', async () => {
      const query: QueryStockDto = { page: 1, limit: 10 };
      const req = { user: { companyId: 1 } };
      const mockRes: any = {
        setHeader: jest.fn(),
      };

      const result = await controller.getStockList(query, req, mockRes);

      expect(mockStockService.getStockList).toHaveBeenCalledWith(query, 1);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-total-count', '1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-page', '1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-limit', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-total-pages', '1');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].country).toBe('Kazakhstan');
    });
  });
});
