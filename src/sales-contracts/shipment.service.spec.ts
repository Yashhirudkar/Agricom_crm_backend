import { ShipmentService } from './shipment.service';
import { Op } from 'sequelize';

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
  let mockAttachmentModel: any;
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
      findByPk: jest.fn().mockResolvedValue(null),
    };
    mockContractModel = {};
    mockItemModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockDocModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockDocFileModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockPurchaseContractService = { ensureExists: jest.fn() };
    mockStockService = { validateShipmentStock: jest.fn() };
    mockReadinessService = { evaluateBatch: jest.fn().mockResolvedValue(new Map()) };
    mockAuditService = {};
    mockStuffingModel = { findOne: jest.fn().mockResolvedValue(null) };
    mockAttachmentModel = { findAll: jest.fn().mockResolvedValue([]) };
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
      mockAttachmentModel,
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

    it('returns calculated Freight Allocation status instead of stored shipment values', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [
          {
            id: 11,
            shipmentDate: '2026-11-20',
            status: 'Scheduled',
            toJSON: () => ({
              id: 11,
              shipmentDate: '2026-11-20',
              status: 'Scheduled',
              freight: 1200,
              freightAllocationStatus: 'Yes',
            }),
          },
          {
            id: 12,
            shipmentDate: '2026-11-21',
            status: 'Scheduled',
            toJSON: () => ({
              id: 12,
              shipmentDate: '2026-11-21',
              status: 'Scheduled',
              freightAllocationStatus: 'No',
            }),
          },
        ],
        count: 2,
      });
      mockReadinessService.evaluateBatch.mockResolvedValue(
        new Map([
          [
            11,
            {
              cargoReady: true,
              freightReady: false,
              freightRequired: true,
              freightRuleReason: 'Freight is required.',
              isFreightNotApplicable: false,
              freightAllocationStatus: 'No',
              systemReady: false,
              manualReadyOverride: null,
              manualReadyBy: null,
              manualReadyByUser: null,
              manualReadyAt: null,
              manualReadyReason: null,
              readyForShipment: false,
              isManualOverride: false,
              readySource: 'System',
              reasons: ['Freight allocation is pending.'],
            },
          ],
          [
            12,
            {
              cargoReady: true,
              freightReady: false,
              freightRequired: false,
              freightRuleReason: 'Freight is not required.',
              isFreightNotApplicable: true,
              freightAllocationStatus: 'No',
              systemReady: true,
              manualReadyOverride: null,
              manualReadyBy: null,
              manualReadyByUser: null,
              manualReadyAt: null,
              manualReadyReason: null,
              readyForShipment: true,
              isManualOverride: false,
              readySource: 'System',
              reasons: [],
            },
          ],
        ]),
      );

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data[0].freightAllocationStatus).toBe('No');
      expect(result.data[0].freightReady).toBe(false);
      expect(result.data[1].freightAllocationStatus).toBe('No');
      expect(result.data[1].freightReady).toBe(false);
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

  describe('getStuffingExecutionData', () => {
    it('uses the shipment transport record mode in auto-populated data', async () => {
      mockShipmentModel.findByPk = jest.fn().mockResolvedValue({
        id: 77,
        logisticsId: 12,
        quantity: 10,
        status: 'Scheduled',
        salesContract: { id: 4, companyId: 1, items: [] },
      });
      mockFreightQuoteModel.findOne = jest.fn().mockResolvedValue({
        id: 22,
        logisticsId: 12,
        transportMode: null,
      });
      mockLogisticsModel.findByPk = jest
        .fn()
        .mockResolvedValue({ transportMode: 'Rail' });
      mockCargoAllocationModel.findAll = jest.fn().mockResolvedValue([]);
      mockCargoLoadingModel.sum = jest.fn().mockResolvedValue(0);
      mockStuffingModel.findOne = jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({
          containers: [
            {
              containerNo: 'CONT-1',
              containerSize: '40 FT',
              vehicleNumber: 'TRUCK-1',
              sealNo: 'SEAL-1',
              stuffingDate: '2026-11-20',
              warehouse: 'Warehouse 1',
              status: 'Pending',
              remarks: 'Keep',
              tareWeight: 1,
              grossWeight: 10,
              netWeight: 9,
            },
          ],
          downtimes: [
            {
              price: 25.75,
              currency: 'INR',
              reason: 'Other',
              customReason: 'Power outage',
              fromDate: '2026-11-20',
              toDate: '2026-11-21',
              duration: '1 day',
              remarks: '',
            },
          ],
          attachments: [
            {
              documentName: 'Loading Photos',
              attachmentId: 73,
              fileName: '',
              fileUrl: '',
              fileSize: 0,
              mimeType: '',
            },
          ],
        }),
      });
      mockAttachmentModel.findAll.mockResolvedValue([
        {
          id: 73,
          originalName: '1.pdf',
          fileSize: 364271,
          mimeType: 'application/pdf',
        },
      ]);
      mockReadinessService.evaluate = jest.fn().mockResolvedValue({
        readyForShipment: false,
        isManualOverride: false,
      });

      const result = await service.getStuffingExecutionData(77);

      expect(mockFreightQuoteModel.findOne).toHaveBeenCalledWith({
        where: {
          [Op.or]: [{ shipmentId: 77 }, { logisticsId: 12 }],
        },
        order: [['id', 'DESC']],
      });
      expect(result.autoPopulated.transportMode).toBe('Rail');
      expect(result.existingStuffing.containers).toEqual([
        {
          containerNo: 'CONT-1',
          containerSize: '40 FT',
          sealNo: 'SEAL-1',
          remarks: 'Keep',
          tareWeight: 1,
          grossWeight: 10,
          netWeight: 9,
        },
      ]);
      expect(result.existingStuffing.downtimes).toHaveLength(1);
      expect(result.existingStuffing.downtimes[0].reason).toBe('Other');
      expect(result.existingStuffing.downtimes[0].price).toBe(25.75);
      expect(result.existingStuffing.downtimes[0].currency).toBe('INR');
      expect(result.existingStuffing.downtimes[0].duration).toBe('1 day');
      expect(mockAttachmentModel.findAll).toHaveBeenCalledWith({
        where: { id: { [Op.in]: [73] } },
        attributes: ['id', 'originalName', 'fileSize', 'mimeType'],
      });
      expect(result.existingStuffing.attachments[0]).toMatchObject({
        documentName: 'Loading Photos',
        attachmentId: 73,
        fileName: '1.pdf',
        fileUrl: '/attachments/73/download',
        downloadUrl: '/attachments/73/download',
        fileSize: 364271,
        mimeType: 'application/pdf',
      });
    });
  });

  describe('normalizeDowntimeRecords', () => {
    it('calculates elapsed days and rejects a From Date later than To Date', () => {
      const normalize = (
        service as unknown as {
          normalizeDowntimeRecords: (
            records: unknown,
          ) => Record<string, unknown>[];
        }
      ).normalizeDowntimeRecords.bind(service);
      const validDowntime = { price: 1, currency: 'USD' };

      expect(
        normalize([
          {
            ...validDowntime,
            price: '12.50',
            currency: 'USD',
            fromDate: '2026-11-20',
            toDate: '2026-11-22',
            reason: 'Weather',
          },
        ]),
      ).toEqual([
        {
          price: 12.5,
          currency: 'USD',
          reason: 'Weather',
          customReason: '',
          fromDate: '2026-11-20',
          toDate: '2026-11-22',
          duration: '2 days',
          remarks: '',
        },
      ]);
      expect(
        normalize([
          {
            ...validDowntime,
            fromDate: '2026-11-20',
            toDate: '2026-11-20',
          },
        ])[0].duration,
      ).toBe('0 days');
      expect(() =>
        normalize([
          {
            ...validDowntime,
            fromDate: '2026-11-22',
            toDate: '2026-11-20',
          },
        ]),
      ).toThrow('From Date cannot be later than To Date');
      expect(() =>
        normalize([
          {
            ...validDowntime,
            fromDate: '2026-02-30',
            toDate: '2026-03-01',
          },
        ]),
      ).toThrow('dates must use YYYY-MM-DD format');
      expect(() =>
        normalize([{ price: 0, currency: 'USD' }]),
      ).toThrow('Price must be greater than 0');
      expect(() => normalize([{ price: 1, currency: '' }])).toThrow(
        'Currency is required',
      );
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

    it('requires a Yes or No dispatch choice before completing stuffing', async () => {
      await expect(
        service.saveStuffingExecution(1, {
          action: 'complete',
          loadingDate: '2026-11-04',
          actualLoadingWeight: 22,
          grossWeight: 22,
          netWeight: 22,
          loadingStartTime: '12:00',
          loadingEndTime: '14:30',
          dispatchMode: 'container',
          containers: [{ dispatch: '' }],
        }),
      ).rejects.toThrow(
        'Select Dispatch (Yes or No) for every container or truck before completing stuffing.',
      );
      expect(mockSequelize.transaction).not.toHaveBeenCalled();
    });
  });
});
