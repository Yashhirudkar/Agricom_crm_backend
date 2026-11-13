import { ShipmentService } from './shipment.service';

describe('ShipmentService - Pending and Executed Tabs', () => {
  let service: ShipmentService;
  let mockShipmentModel: any;
  let mockContractModel: any;
  let mockItemModel: any;
  let mockDocModel: any;
  let mockDocFileModel: any;
  let mockPurchaseContractService: any;
  let mockStockService: any;
  let mockReadinessService: any;
  let mockAuditService: any;
  let mockStuffingModel: any;
  let mockCargoAllocationModel: any;
  let mockCargoLoadingModel: any;
  let mockLogisticsModel: any;
  let mockFreightQuoteModel: any;
  let mockSequelize: any;

  beforeEach(() => {
    mockShipmentModel = {
      findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockContractModel = {};
    mockItemModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockDocModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockDocFileModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockPurchaseContractService = { ensureExists: jest.fn() };
    mockStockService = { validateShipmentStock: jest.fn() };
    mockReadinessService = { evaluateBatch: jest.fn().mockResolvedValue(new Map()) };
    mockAuditService = {};
    mockStuffingModel = {};
    mockCargoAllocationModel = {};
    mockCargoLoadingModel = {};
    mockLogisticsModel = {};
    mockFreightQuoteModel = {};
    mockSequelize = {
      query: jest.fn().mockResolvedValue([[]]),
      transaction: jest.fn(),
    };

    service = new ShipmentService(
      mockShipmentModel,
      mockContractModel,
      mockItemModel,
      mockDocModel,
      mockDocFileModel,
      mockPurchaseContractService,
      mockStockService,
      mockReadinessService,
      mockAuditService,
      mockStuffingModel,
      mockCargoAllocationModel,
      mockCargoLoadingModel,
      mockLogisticsModel,
      mockFreightQuoteModel,
      mockSequelize,
    );
  });

  describe('findAll Tab Filtering and Counts', () => {
    it('defaults to pending tab when no tab is provided and queries both counts', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [
          {
            id: 1,
            shipmentDate: '2026-11-20',
            status: 'Scheduled',
            toJSON: () => ({ id: 1, shipmentDate: '2026-11-20', status: 'Scheduled' }),
          },
        ],
        count: 24,
      });
      mockShipmentModel.count.mockResolvedValue(3);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(mockShipmentModel.findAndCountAll).toHaveBeenCalledTimes(1);
      expect(mockShipmentModel.count).toHaveBeenCalledTimes(1);

      expect(result.pendingCount).toBe(24);
      expect(result.executedCount).toBe(3);
      expect(result.total).toBe(24);
      expect(result.data.length).toBe(1);
    });

    it('returns executed shipments and correct counts when tab is executed', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [
          {
            id: 2,
            shipmentDate: '2026-11-10',
            status: 'Executed',
            toJSON: () => ({ id: 2, shipmentDate: '2026-11-10', status: 'Executed' }),
          },
        ],
        count: 5,
      });
      mockShipmentModel.count.mockResolvedValue(20);

      const result = await service.findAll({ tab: 'executed', page: 1, limit: 10 });

      expect(result.pendingCount).toBe(20);
      expect(result.executedCount).toBe(5);
      expect(result.total).toBe(5);
    });

    it('supports status=pending query parameter', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 15,
      });
      mockShipmentModel.count.mockResolvedValue(4);

      const result = await service.findAll({ status: 'pending', page: 1, limit: 10 });

      expect(result.pendingCount).toBe(15);
      expect(result.executedCount).toBe(4);
      expect(result.total).toBe(15);
    });

    it('supports status=executed query parameter', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 8,
      });
      mockShipmentModel.count.mockResolvedValue(12);

      const result = await service.findAll({ status: 'executed', page: 1, limit: 10 });

      expect(result.pendingCount).toBe(12);
      expect(result.executedCount).toBe(8);
      expect(result.total).toBe(8);
    });
  });

  describe('getStats', () => {
    it('returns pendingCount and executedCount in stats', async () => {
      mockShipmentModel.findAll.mockResolvedValue([
        { id: 1, shipmentDate: '2026-11-20', status: 'Scheduled', noOfContainers: 2, quantity: 50 },
        { id: 2, shipmentDate: '2026-11-20', status: 'Scheduled', noOfContainers: 1, quantity: 25 },
        { id: 3, shipmentDate: '2026-11-10', status: 'Executed', executionStatus: 'Loading Completed', noOfContainers: 3, quantity: 75 },
      ]);

      const stats = await service.getStats({});

      expect(stats.total).toBe(3);
      expect(stats.pendingCount).toBe(2);
      expect(stats.executedCount).toBe(1);
    });
  });

  describe('saveStuffingExecution', () => {
    it('requires every Loading & Weights field before completing stuffing', async () => {
      await expect(
        service.saveStuffingExecution(1, { action: 'complete' }),
      ).rejects.toThrow(
        'Date of Loading, Actual Loading Weight (MT), Gross Weight (MT), Net Weight (MT), Loading Start Time, Loading End Time',
      );
      expect(mockSequelize.transaction).not.toHaveBeenCalled();
    });
  });
});
