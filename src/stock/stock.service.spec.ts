import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { Op } from 'sequelize';
import { StockService } from './stock.service';
import { StockCalculationService } from './services/stock-calculation.service';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../purchase-contracts/models/purchase-contract-shipment.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { Product } from '../masters/product/product.model';
import { Country } from '../masters/country/country.model';
import { Port } from '../masters/port/port.model';
import { ExchangeRateService } from '../exchange-rates/exchange-rate.service';

describe('StockService', () => {
  let service: StockService;
  let mockPurchaseContractModel: any;
  let mockShipmentModel: any;
  let mockShipmentLinkModel: any;
  let mockPortModel: any;
  let mockCountryModel: any;
  let mockExchangeRateService: { getLatestRates: jest.Mock };

  beforeEach(async () => {
    mockPurchaseContractModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockShipmentModel = {
      findAll: jest.fn().mockResolvedValue([]),
      findByPk: jest.fn(),
    };
    mockShipmentLinkModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockPortModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockCountryModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockExchangeRateService = {
      getLatestRates: jest.fn().mockResolvedValue([]),
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
          provide: getModelToken(SalesContractShipment),
          useValue: mockShipmentModel,
        },
        {
          provide: getModelToken(PurchaseContractShipment),
          useValue: mockShipmentLinkModel,
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
        {
          provide: ExchangeRateService,
          useValue: mockExchangeRateService,
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

    it('preserves original contract amounts without looking up exchange rates', async () => {
      mockExchangeRateService.getLatestRates.mockResolvedValue([
        {
          baseCurrency: 'USD',
          exchangeRate: '86.42',
          effectiveDate: '2026-11-10',
        },
      ]);
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 22,
          contractNumber: 'PC-USD-001',
          status: 'ACTIVE',
          loadingCountry: 'Kazakhstan',
          currencyCode: 'USD',
          seller: { entityName: 'Export Grain' },
          items: [
            {
              id: 10,
              product: { name: 'Golden Linseed' },
              quantity: 2,
              ratePerMt: 10,
            },
          ],
        },
      ]);

      const result = await service.getStockList({});
      const contract = result.data[0].products[0].contracts[0];

      expect(mockExchangeRateService.getLatestRates).not.toHaveBeenCalled();
      expect(contract).toMatchObject({
        currency: 'USD',
        amount: 20,
      });
      expect(result.data[0].amountByCurrency).toEqual({ USD: 20 });
    });

    it('returns dashboard purchase totals in INR with FX tooltip details', async () => {
      mockExchangeRateService.getLatestRates.mockResolvedValue([
        {
          baseCurrency: 'EUR',
          exchangeRate: '99.18',
          effectiveDate: '2026-11-10',
        },
      ]);
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 33,
          contractNumber: 'PC-EUR-001',
          status: 'ACTIVE',
          loadingCountry: 'France',
          currencyCode: 'EUR',
          items: [
            {
              id: 11,
              product: { name: 'Wheat' },
              quantity: 3,
              ratePerMt: 10,
            },
          ],
        },
        {
          id: 34,
          contractNumber: 'PC-INR-001',
          status: 'ACTIVE',
          loadingCountry: 'France',
          currencyCode: 'INR',
          items: [
            {
              id: 12,
              product: { name: 'Wheat' },
              quantity: 1,
              ratePerMt: 400,
            },
          ],
        },
      ]);

      const summary = await service.getDashboardSummary();

      expect(summary.totalAmountINR).toBe(3375.4);
      expect(summary.grandTotalInr).toBe(3375.4);
      expect(summary.exchangeRateDate).toBe('2026-11-10');
      expect(summary.currencyBreakdown).toEqual([
        { currency: 'EUR', amount: 30 },
        { currency: 'INR', amount: 400 },
      ]);
      expect(summary.totalAmountByCurrency).toEqual({ INR: 3375.4 });
      expect(summary.amountDetails).toEqual([
        expect.objectContaining({
          contractNo: 'PC-EUR-001',
          originalCurrency: 'EUR',
          originalAmount: 30,
          exchangeRate: 99.18,
          exchangeRateDate: '2026-11-10',
          convertedAmount: 2975.4,
        }),
        expect.objectContaining({
          contractNo: 'PC-INR-001',
          originalCurrency: 'INR',
          originalAmount: 400,
          exchangeRate: 1,
          exchangeRateDate: null,
          convertedAmount: 400,
        }),
      ]);
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
      expect(summary.totalExecutedMT).toBe(0);
      expect(summary.totalAvailableMT).toBe(100);
    });
  });

  it('deducts each executed shipment from its linked Purchase Contract stock key', async () => {
    const purchaseContract = {
      id: 45,
      contractNumber: 'PC-EE-045',
      status: 'ACTIVE',
      loadingCountry: 'Estonia',
      purchaseDate: new Date('2026-11-01T00:00:00Z'),
      seller: { entityName: 'Estonia Supplier' },
      buyer: { entityName: 'Agricom' },
      items: [
        {
          id: 70,
          productId: 12,
          product: { id: 12, name: 'POPCORN' },
          quantity: 220,
        },
      ],
    };
    mockPurchaseContractModel.findAll.mockResolvedValue([purchaseContract]);
    mockShipmentModel.findAll.mockResolvedValue([
      {
        id: 9,
        shipmentNo: 1,
        shipmentReference: 'REF-000009',
        salesContractId: 30,
        quantity: 22,
        status: 'Executed',
        updatedAt: new Date('2026-11-10T00:00:00Z'),
        salesContract: {
          contractNumber: 'SC-EE-030',
          originCountry: 'Ghana',
          buyerId: 2,
          buyer: { entityName: 'Agricom' },
          seller: { entityName: 'Estonia Supplier' },
          items: [{ productId: 12, product: { id: 12, name: 'POPCORN' } }],
        },
      },
      {
        id: 10,
        shipmentNo: 2,
        shipmentReference: 'REF-000010',
        salesContractId: 30,
        quantity: 22,
        status: 'Executed',
        updatedAt: new Date('2026-11-11T00:00:00Z'),
        salesContract: {
          contractNumber: 'SC-EE-030',
          originCountry: 'Ghana',
          buyerId: 2,
          buyer: { entityName: 'Agricom' },
          seller: { entityName: 'Estonia Supplier' },
          items: [{ productId: 12, product: { id: 12, name: 'POPCORN' } }],
        },
      },
    ]);
    mockShipmentLinkModel.findAll.mockResolvedValue([
      {
        shipmentId: 9,
        purchaseContractId: 45,
        purchaseContractItemId: 70,
        allocatedQuantity: 22,
        purchaseContract,
      },
      {
        shipmentId: 10,
        purchaseContractId: 45,
        purchaseContractItemId: 70,
        allocatedQuantity: 22,
        purchaseContract,
      },
    ]);

    const result = await service.getStockList({});
    const estonia = result.data.find((country) => country.country === 'Estonia');
    const popcorn = estonia?.products.find(
      (product) => product.product === 'POPCORN',
    );

    expect(popcorn).toMatchObject({
      purchased: 220,
      executed: 44,
      available: 176,
    });
    expect(popcorn?.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'OUT',
          reference: 'REF-000009',
          out: 22,
          balance: 198,
        }),
        expect.objectContaining({
          type: 'OUT',
          reference: 'REF-000010',
          out: 22,
          balance: 176,
        }),
      ]),
    );
    const dashboard = await service.getDashboardSummary(1);
    expect(dashboard).toMatchObject({
      totalPurchasedMT: 220,
      totalExecutedMT: 44,
      totalAvailableMT: 176,
    });
    expect(result.data.some((country) => country.country === 'Ghana')).toBe(
      false,
    );
  });

  it('includes legacy executed shipments with null companyId via their Sales Contract tenant', async () => {
    mockPurchaseContractModel.findAll.mockResolvedValue([
      {
        id: 45,
        contractNumber: 'PC-EE-045',
        status: 'ACTIVE',
        loadingCountry: 'Estonia',
        purchaseDate: new Date('2026-11-01T00:00:00Z'),
        items: [
          {
            id: 70,
            productId: 12,
            product: { id: 12, name: 'POPCORN' },
            quantity: 220,
          },
        ],
      },
    ]);
    mockShipmentModel.findAll.mockResolvedValue([
      {
        id: 9,
        shipmentNo: 1,
        shipmentReference: 'REF-000009',
        salesContractId: 30,
        companyId: null,
        quantity: 22,
        status: 'Executed',
        salesContract: {
          companyId: 1,
          contractNumber: 'SC-EE-030',
          originCountry: 'Ghana',
          items: [{ productId: 12, product: { id: 12, name: 'POPCORN' } }],
        },
      },
    ]);
    mockShipmentLinkModel.findAll.mockResolvedValue([
      {
        shipmentId: 9,
        purchaseContractId: 45,
        purchaseContractItemId: 70,
        allocatedQuantity: 22,
        purchaseContract: {
          id: 45,
          contractNumber: 'PC-EE-045',
          loadingCountry: 'Estonia',
          items: [
            {
              id: 70,
              productId: 12,
              product: { id: 12, name: 'POPCORN' },
              quantity: 220,
            },
          ],
        },
      },
    ]);

    const result = await service.getStockList({}, 1);
    const shipmentQuery = mockShipmentModel.findAll.mock.calls[0][0];
    const estonia = result.data.find((country) => country.country === 'Estonia');
    const popcorn = estonia?.products.find(
      (product) => product.product === 'POPCORN',
    );

    expect(shipmentQuery.where[Op.or][0]).toEqual({ companyId: 1 });
    expect(shipmentQuery.where[Op.or][1].companyId).toBeNull();
    expect(shipmentQuery.where[Op.or][1][Op.and]).toMatchObject({
      attribute: { col: 'salesContract.company_id' },
      comparator: '=',
      logic: 1,
    });
    expect(popcorn).toMatchObject({
      purchased: 220,
      executed: 22,
      available: 198,
    });
  });

  describe('validateShipmentStock', () => {
    it('validates stock against the linked Purchase Contract loading country', async () => {
      const purchaseContract = {
        id: 45,
        contractNumber: 'PC-EE-045',
        status: 'ACTIVE',
        loadingCountry: 'Estonia',
        items: [
          {
            id: 70,
            productId: 12,
            product: { id: 12, name: 'POPCORN' },
            quantity: 220,
          },
        ],
      };
      mockPurchaseContractModel.findAll.mockResolvedValue([purchaseContract]);
      mockShipmentModel.findAll.mockResolvedValue([]);
      mockShipmentLinkModel.findAll.mockResolvedValue([
        {
          shipmentId: 9,
          purchaseContractId: 45,
          purchaseContractItemId: 70,
          allocatedQuantity: 22,
          purchaseContract,
        },
      ]);

      const result = await service.validateShipmentStock({
        id: 9,
        quantity: 22,
        origin: 'Ghana',
        salesContract: {
          originCountry: 'Ghana',
          items: [{ productId: 12, product: { name: 'POPCORN' } }],
        },
      } as any);

      expect(result).toMatchObject({
        isValid: true,
        availableStock: 220,
        requiredStock: 22,
        country: 'Estonia',
        product: 'POPCORN',
      });
    });

    it('Scenario 3: should throw BadRequestException when available stock is insufficient', async () => {
      // 100 MT Purchased
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 1,
          contractNumber: 'PC-1',
          status: 'ACTIVE',
          loadingCountry: 'India',
          items: [
            {
              id: 1,
              product: { name: 'Mustard' },
              quantity: 100,
            },
          ],
        },
      ]);
      mockShipmentModel.findAll.mockResolvedValue([]);

      const mockShipmentToExecute: any = {
        id: 99,
        quantity: 150, // Requires 150 MT, but only 100 MT available
        origin: 'India',
        salesContract: {
          originCountry: 'India',
          items: [{ product: { name: 'Mustard' } }],
        },
      };

      await expect(
        service.validateShipmentStock(mockShipmentToExecute),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate successfully when available stock is sufficient', async () => {
      mockPurchaseContractModel.findAll.mockResolvedValue([
        {
          id: 1,
          contractNumber: 'PC-1',
          status: 'ACTIVE',
          loadingCountry: 'India',
          items: [
            {
              id: 1,
              product: { name: 'Mustard' },
              quantity: 500,
            },
          ],
        },
      ]);
      mockShipmentModel.findAll.mockResolvedValue([]);

      const mockShipmentToExecute: any = {
        id: 99,
        quantity: 120, // Requires 120 MT, 500 MT available
        origin: 'India',
        salesContract: {
          originCountry: 'India',
          items: [{ product: { name: 'Mustard' } }],
        },
      };

      const result = await service.validateShipmentStock(mockShipmentToExecute);
      expect(result.isValid).toBe(true);
      expect(result.availableStock).toBe(500);
      expect(result.requiredStock).toBe(120);
    });
  });
});
