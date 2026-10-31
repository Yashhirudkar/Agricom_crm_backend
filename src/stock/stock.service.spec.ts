import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { StockService } from './stock.service';
import { StockCalculationService } from './services/stock-calculation.service';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { Product } from '../masters/product/product.model';
import { Country } from '../masters/country/country.model';
import { Port } from '../masters/port/port.model';

describe('StockService', () => {
  let service: StockService;
  let mockPurchaseContractModel: any;
  let mockPortModel: any;
  let mockCountryModel: any;

  beforeEach(async () => {
    mockPurchaseContractModel = {
      findAll: jest.fn(),
    };
    mockPortModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockCountryModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        StockCalculationService,
        {
          provide: getModelToken(PurchaseContract),
          useValue: mockPurchaseContractModel,
        },
        {
          provide: getModelToken(PurchaseContractItem),
          useValue: {},
        },
        {
          provide: getModelToken(Product),
          useValue: {},
        },
        {
          provide: getModelToken(Country),
          useValue: mockCountryModel,
        },
        {
          provide: getModelToken(Port),
          useValue: mockPortModel,
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStockList', () => {
    it('should dynamically calculate purchase stock hierarchy from Purchase Contracts', async () => {
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 22,
          contractNumber: 'PC-VA-2512627',
          status: 'ACTIVE',
          loadingCountry: 'Kazakhstan',
          placeOfLoading: 'Petropavlovsk',
          seller: { id: 1, entityName: 'Export Grain' },
          buyer: { id: 2, entityName: 'Agricom DMCC' },
          items: [
            {
              id: 10,
              productId: 5,
              product: { id: 5, name: 'Golden Linseed' },
              quantity: 88,
              packing: '50kg Bags',
            },
          ],
        },
      ]);

      const result = await service.getStockList({});
      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(1);

      const countryGroup = result.data[0];
      expect(countryGroup.country).toBe('Kazakhstan');
      expect(countryGroup.totalPurchased).toBe(88);

      const productNode = countryGroup.products[0];
      expect(productNode.product).toBe('Golden Linseed');
      expect(productNode.purchased).toBe(88);

      const contract = productNode.contracts[0];
      expect(contract.contractId).toBe(22);
      expect(contract.contractNo).toBe('PC-VA-2512627');
      expect(contract.supplier).toBe('Export Grain');
      expect(contract.purchaseQty).toBe(88);
    });

    it('should resolve country from place of loading port when loadingCountry is empty', async () => {
      mockPortModel.findAll.mockResolvedValue([
        {
          portName: 'Kandla',
          country: { name: 'India' },
        },
      ]);

      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 30,
          contractNumber: 'PC-IN-001',
          status: 'ACTIVE',
          loadingCountry: null, // empty
          placeOfLoading: 'Kandla', // Matches port
          seller: { id: 10, entityName: 'Indian Exporter' },
          items: [
            {
              id: 11,
              productId: 8,
              product: { id: 8, name: 'Sesame Seed' },
              quantity: 50,
            },
          ],
        },
      ]);

      const result = await service.getStockList({});
      expect(result.data.length).toBe(1);
      expect(result.data[0].country).toBe('India');
    });

    it('should ignore contracts where Place of Loading country cannot be resolved', async () => {
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 99,
          contractNumber: 'PC-NO-COUNTRY',
          status: 'ACTIVE',
          loadingCountry: null,
          placeOfLoading: null,
          seller: { id: 1, entityName: 'Unknown' },
          items: [
            {
              id: 1,
              product: { id: 1, name: 'Wheat' },
              quantity: 100,
            },
          ],
        },
      ]);

      const result = await service.getStockList({});
      expect(result.data.length).toBe(0);
    });
  });

  describe('getDashboardSummary', () => {
    it('should return aggregated dashboard statistics', async () => {
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 1,
          contractNumber: 'PC-1',
          status: 'ACTIVE',
          loadingCountry: 'Kazakhstan',
          items: [
            {
              id: 1,
              product: { name: 'Golden Linseed' },
              quantity: 100,
            },
          ],
        },
      ]);

      const summary = await service.getDashboardSummary();
      expect(summary.totalCountries).toBe(1);
      expect(summary.totalProducts).toBe(1);
      expect(summary.totalPurchaseContracts).toBe(1);
      expect(summary.totalPurchasedMT).toBe(100);
    });
  });
});
