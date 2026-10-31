import { StockCalculationService } from './stock-calculation.service';
import { RawContractPayload } from './stock-calculation.service';

describe('StockCalculationService', () => {
  let service: StockCalculationService;

  beforeEach(() => {
    service = new StockCalculationService();
  });

  describe('buildHierarchy', () => {
    it('should calculate and aggregate purchase amounts by currency', () => {
      const hierarchy = service.buildHierarchy([
        {
          contractId: 1,
          contractNo: 'PC-AL-001',
          supplier: 'Supplier 1',
          country: 'Albania',
          product: 'White Mustard',
          purchaseQty: 110,
          price: 23,
          currency: 'USD',
          status: 'ACTIVE',
        },
        {
          contractId: 2,
          contractNo: 'PC-AL-002',
          supplier: 'Supplier 2',
          country: 'Albania',
          product: 'White Mustard',
          purchaseQty: 23,
          price: 222,
          currency: 'USD',
          status: 'ACTIVE',
        },
      ]);

      expect(hierarchy[0].products[0].purchased).toBe(133);
      expect(hierarchy[0].products[0].contractCount).toBe(2);
      expect(hierarchy[0].products[0].amountByCurrency).toEqual({
        USD: 7636,
      });
    });

    it('should group contracts by Country -> Product -> Contracts', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 101,
          contractNo: 'PC-001',
          supplier: 'Export Grain',
          buyer: 'Agricom Buyer',
          country: 'Kazakhstan',
          product: 'Golden Linseed',
          productId: 1,
          purchaseQty: 88,
          status: 'ACTIVE',
        },
        {
          contractId: 102,
          contractNo: 'PC-002',
          supplier: 'Kazakh Agro',
          buyer: 'Agricom Buyer',
          country: 'Kazakhstan',
          product: 'Golden Linseed',
          productId: 1,
          purchaseQty: 44,
          status: 'ACTIVE',
        },
        {
          contractId: 103,
          contractNo: 'PC-003',
          supplier: 'India Agri',
          buyer: 'Agricom Buyer',
          country: 'India',
          product: 'Niger Seed',
          productId: 2,
          purchaseQty: 100,
          status: 'ACTIVE',
        },
      ];

      const hierarchy = service.buildHierarchy(rawContracts);

      expect(hierarchy.length).toBe(2);

      // Find Kazakhstan
      const kaz = hierarchy.find((h) => h.country === 'Kazakhstan');
      expect(kaz).toBeDefined();
      expect(kaz?.totalPurchased).toBe(132); // 88 + 44

      // In Kazakhstan, single product "Golden Linseed" with 2 contracts
      expect(kaz?.products.length).toBe(1);
      const linseed = kaz?.products[0];
      expect(linseed?.product).toBe('Golden Linseed');
      expect(linseed?.purchased).toBe(132);
      expect(linseed?.contracts.length).toBe(2);
      expect(linseed?.contracts[0].contractNo).toBe('PC-001');
      expect(linseed?.contracts[0].purchaseQty).toBe(88);

      // Find India
      const ind = hierarchy.find((h) => h.country === 'India');
      expect(ind).toBeDefined();
      expect(ind?.totalPurchased).toBe(100);
      expect(ind?.products.length).toBe(1);
      expect(ind?.products[0].product).toBe('Niger Seed');
    });

    it('should ignore contracts with missing country or missing product', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 1,
          contractNo: 'PC-EMPTY-COUNTRY',
          supplier: 'S1',
          country: '',
          product: 'Wheat',
          purchaseQty: 100,
          status: 'ACTIVE',
        },
        {
          contractId: 2,
          contractNo: 'PC-EMPTY-PRODUCT',
          supplier: 'S2',
          country: 'Kazakhstan',
          product: '',
          purchaseQty: 100,
          status: 'ACTIVE',
        },
      ];

      const hierarchy = service.buildHierarchy(rawContracts);
      expect(hierarchy.length).toBe(0);
    });
  });

  describe('calculateDashboardSummary', () => {
    it('should compute total summary cards correctly', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 1,
          contractNo: 'PC-1',
          supplier: 'S1',
          country: 'Kazakhstan',
          product: 'Golden Linseed',
          purchaseQty: 132,
          status: 'ACTIVE',
        },
        {
          contractId: 2,
          contractNo: 'PC-2',
          supplier: 'S2',
          country: 'India',
          product: 'Niger Seed',
          purchaseQty: 200,
          status: 'ACTIVE',
        },
      ];

      const hierarchy = service.buildHierarchy(rawContracts);
      const summary = service.calculateDashboardSummary(hierarchy);

      expect(summary.totalCountries).toBe(2);
      expect(summary.totalProducts).toBe(2);
      expect(summary.totalPurchaseContracts).toBe(2);
      expect(summary.totalPurchasedMT).toBe(332);
    });
  });

  describe('sortHierarchy', () => {
    it('should sort by purchased quantity DESC', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 1,
          contractNo: 'PC-1',
          supplier: 'S1',
          country: 'CountryA',
          product: 'ProdA',
          purchaseQty: 50,
          status: 'ACTIVE',
        },
        {
          contractId: 2,
          contractNo: 'PC-2',
          supplier: 'S2',
          country: 'CountryB',
          product: 'ProdB',
          purchaseQty: 200,
          status: 'ACTIVE',
        },
      ];

      const hierarchy = service.buildHierarchy(rawContracts, {
        sortBy: 'purchasedQty',
        sortOrder: 'DESC',
      });

      expect(hierarchy[0].country).toBe('CountryB');
      expect(hierarchy[1].country).toBe('CountryA');
    });
  });
});
