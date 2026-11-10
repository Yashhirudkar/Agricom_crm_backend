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

    it('Scenario 1: should reduce stock when shipments are executed (Purchased: 500, Executed: 120 -> Available: 380)', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 1,
          contractNo: 'PC-001',
          supplier: 'Agri Supplier',
          country: 'Kazakhstan',
          product: 'Golden Linseed',
          purchaseQty: 500,
          status: 'ACTIVE',
        },
      ];

      const rawShipments = [
        {
          shipmentId: 10,
          shipmentNo: 1,
          shipmentReference: 'SH-001',
          salesContractId: 1,
          buyer: 'Buyer Co',
          country: 'Kazakhstan',
          product: 'Golden Linseed',
          executedQty: 120,
          executionDate: new Date('2026-02-01'),
          status: 'Executed',
        },
      ];

      const hierarchy = service.buildHierarchy(rawContracts, rawShipments);

      expect(hierarchy.length).toBe(1);
      const kaz = hierarchy[0];
      expect(kaz.country).toBe('Kazakhstan');
      expect(kaz.totalPurchased).toBe(500);
      expect(kaz.totalExecuted).toBe(120);
      expect(kaz.totalAvailable).toBe(380);

      const prod = kaz.products[0];
      expect(prod.product).toBe('Golden Linseed');
      expect(prod.purchased).toBe(500);
      expect(prod.executed).toBe(120);
      expect(prod.available).toBe(380);

      // Verify movements in Product Node
      expect(prod.movements).toBeDefined();
      expect(prod.movements?.length).toBe(2);

      const inMove = prod.movements?.find((m) => m.type === 'IN');
      expect(inMove?.in).toBe(500);
      expect(inMove?.out).toBe(0);

      const outMove = prod.movements?.find((m) => m.type === 'OUT');
      expect(outMove?.in).toBe(0);
      expect(outMove?.out).toBe(120);
      expect(outMove?.movement).toBe('Shipment Executed');
      expect(outMove?.movementType).toBe('Shipment Executed');
      expect(outMove?.date).toEqual(new Date('2026-02-01'));

      // Verify dashboard summary
      const dashboard = service.calculateDashboardSummary(hierarchy);
      expect(dashboard.totalPurchasedMT).toBe(500);
      expect(dashboard.totalExecutedMT).toBe(120);
      expect(dashboard.totalAvailableMT).toBe(380);
    });

    it('Scenario 4: should automatically restore stock when executed shipment is removed / cancelled', () => {
      const rawContracts: RawContractPayload[] = [
        {
          contractId: 1,
          contractNo: 'PC-001',
          supplier: 'Supplier A',
          country: 'India',
          product: 'Mustard',
          purchaseQty: 200,
          status: 'ACTIVE',
        },
      ];

      // Initially executed: 50 MT consumed -> 150 MT available
      const shipments = [
        {
          shipmentId: 1,
          shipmentNo: 1,
          shipmentReference: 'SH-1',
          salesContractId: 1,
          buyer: 'Buyer 1',
          country: 'India',
          product: 'Mustard',
          executedQty: 50,
          executionDate: new Date('2026-01-15'),
          status: 'Executed',
        },
      ];

      const initialHierarchy = service.buildHierarchy(rawContracts, shipments);
      expect(initialHierarchy[0].products[0].available).toBe(150);

      // Shipment is cancelled: omitted from executed shipments
      const restoredHierarchy = service.buildHierarchy(rawContracts, []);
      expect(restoredHierarchy[0].products[0].executed).toBe(0);
      expect(restoredHierarchy[0].products[0].available).toBe(200);
    });
  });
});
