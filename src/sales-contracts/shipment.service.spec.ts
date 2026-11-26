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
    mockReadinessService = {
      evaluateBatch: jest.fn().mockResolvedValue(new Map()),
    };
    mockAuditService = { writeLog: jest.fn().mockResolvedValue(undefined) };
    mockStuffingModel = {
      findOne: jest.fn().mockResolvedValue(null),
      sum: jest.fn().mockResolvedValue(0),
    };
    mockAttachmentModel = { findAll: jest.fn().mockResolvedValue([]) };
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
      mockLogisticsModel,
      mockFreightQuoteModel,
      mockSequelize,
    );
  });

  describe('Cargo readiness permissions', () => {
    it('saves an initial cargo confirmation for a user with create permission', async () => {
      const shipment = {
        id: 25,
        cargoReadyConfirmed: null,
        cargoReadyDate: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockShipmentModel.findByPk.mockResolvedValue(shipment);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 25 } as any);

      await service.updateCargoReadiness(
        25,
        { cargoReadyConfirmed: true, cargoReadyDate: '2026-11-25' },
        { id: 7 },
        new Set(['cargo_allocation:create']),
      );

      expect(shipment.cargoReadyConfirmed).toBe(true);
      expect(shipment.cargoReadyDate).toBe('2026-11-25');
      expect(shipment.save).toHaveBeenCalledTimes(1);
      expect(mockAuditService.writeLog).toHaveBeenCalledTimes(1);
    });

    it('locks saved readiness unless the user has edit completed permission', async () => {
      const shipment = {
        id: 26,
        cargoReadyConfirmed: true,
        cargoReadyDate: '2026-11-25',
        save: jest.fn(),
      };
      mockShipmentModel.findByPk.mockResolvedValue(shipment);

      await expect(
        service.updateCargoReadiness(
          26,
          { cargoReadyConfirmed: false },
          { id: 7 },
          new Set(['cargo_allocation:create', 'cargo_allocation:update']),
        ),
      ).rejects.toThrow(
        'Cargo readiness is already saved and can only be changed by users with Cargo Allocation Edit Completed permission.',
      );

      expect(shipment.save).not.toHaveBeenCalled();
    });

    it('allows repeated edits for a user with edit completed permission', async () => {
      const shipment = {
        id: 27,
        cargoReadyConfirmed: true,
        cargoReadyDate: '2026-11-25',
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockShipmentModel.findByPk.mockResolvedValue(shipment);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 27 } as any);

      await service.updateCargoReadiness(
        27,
        { cargoReadyConfirmed: false },
        { id: 8 },
        new Set(['cargo_allocation:edit_completed']),
      );

      expect(shipment.cargoReadyConfirmed).toBe(false);
      expect(shipment.cargoReadyDate).toBeNull();
      expect(shipment.save).toHaveBeenCalledTimes(1);
      expect(mockAuditService.writeLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll Tab Filtering and Counts', () => {
    it('defaults to pending tab when no tab is provided and queries both counts', async () => {
      mockShipmentModel.findAndCountAll.mockResolvedValue({
        rows: [
          {
            id: 1,
            shipmentDate: '2026-11-20',
            status: 'Scheduled',
            toJSON: () => ({
              id: 1,
              shipmentDate: '2026-11-20',
              status: 'Scheduled',
            }),
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
            toJSON: () => ({
              id: 2,
              shipmentDate: '2026-11-10',
              status: 'Executed',
            }),
          },
        ],
        count: 5,
      });
      mockShipmentModel.count.mockResolvedValue(20);

      const result = await service.findAll({
        tab: 'executed',
        page: 1,
        limit: 10,
      });

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

      const result = await service.findAll({
        status: 'pending',
        page: 1,
        limit: 10,
      });

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

      const result = await service.findAll({
        status: 'executed',
        page: 1,
        limit: 10,
      });

      expect(result.pendingCount).toBe(12);
      expect(result.executedCount).toBe(8);
      expect(result.total).toBe(8);
    });
  });

  describe('getStats', () => {
    it('returns pendingCount and executedCount in stats', async () => {
      mockShipmentModel.findAll.mockResolvedValue([
        {
          id: 1,
          shipmentDate: '2026-11-20',
          status: 'Scheduled',
          noOfContainers: 2,
          quantity: 50,
        },
        {
          id: 2,
          shipmentDate: '2026-11-20',
          status: 'Scheduled',
          noOfContainers: 1,
          quantity: 25,
        },
        {
          id: 3,
          shipmentDate: '2026-11-10',
          status: 'Executed',
          executionStatus: 'Loading Completed',
          noOfContainers: 3,
          quantity: 75,
        },
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

    describe('Stuffing execution cargo confirmation guard', () => {
      it.each(['complete', 'dispatch'])(
        'rejects %s when cargo has not been confirmed ready',
        async (action) => {
          jest.spyOn(service, 'assertCanModifyStuffing').mockResolvedValue({
            allowed: true,
            isCompleted: false,
            isOverride: false,
            isOneTimeEdit: false,
          });
          mockShipmentModel.findByPk.mockResolvedValue({
            id: 42,
            cargoReadyConfirmed: false,
          });
          mockSequelize.transaction.mockImplementation((callback: any) =>
            callback({ LOCK: { UPDATE: 'UPDATE' } }),
          );

          await expect(
            service.saveStuffingExecution(42, {
              action,
              loadingDate: '2026-11-25',
              actualLoadingWeight: 10,
              grossWeight: 10,
              netWeight: 10,
              loadingStartTime: '09:00',
              loadingEndTime: '10:00',
              dispatchMode: 'truck',
              trucks: [{ dispatch: 'Yes' }],
            }),
          ).rejects.toThrow(
            'Cargo Allocation must be marked Yes before completing shipment stuffing.',
          );
        },
      );
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
      expect(() => normalize([{ price: 0, currency: 'USD' }])).toThrow(
        'Price must be greater than 0',
      );
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

  describe('Multi-Shipment Stuffing Execution (Truck & Rail Freight / Wagon)', () => {
    const buildShipments = (originTransportMode: string) =>
      [101, 102, 103].map((id, idx) => ({
        id,
        companyId: 1,
        salesContractId: 50,
        shipmentNo: idx + 1,
        shipmentReference: `SHP-${id}`,
        shipmentDate: '2026-11-26',
        quantity: 22,
        status: 'Scheduled',
        executionStatus: 'Pending',
        cargoReadyConfirmed: true,
        freightAllocationStatus: 'Yes',
        salesContract: {
          id: 50,
          companyId: 1,
          contractNumber: 'SC-50',
          originTransportMode,
          items: [],
          buyer: { entityName: 'Buyer Ltd' },
          seller: { entityName: 'Seller Ltd' },
        },
        save: jest.fn(function () {
          return Promise.resolve(this);
        }),
      }));

    it('loads combined multi-shipment data for Truck while keeping per-shipment freight quotes separate', async () => {
      const shipments = buildShipments('road');
      mockShipmentModel.findAll.mockResolvedValue(shipments);
      mockFreightQuoteModel.findAll = jest.fn().mockResolvedValue([
        {
          id: 1,
          shipmentId: 101,
          quoteNumber: 'FQ-101',
          freightAmount: 1000,
          currency: 'INR',
          carrierReferenceNo: 'Transporter A',
        },
        {
          id: 2,
          shipmentId: 102,
          quoteNumber: 'FQ-102',
          freightAmount: 1100,
          currency: 'INR',
          carrierReferenceNo: 'Transporter B',
        },
      ]);
      mockReadinessService.evaluateBatch.mockResolvedValue(
        new Map([
          [101, { readyForShipment: true, isManualOverride: false }],
          [102, { readyForShipment: true, isManualOverride: false }],
          [103, { readyForShipment: true, isManualOverride: false }],
        ]),
      );

      const res: any = await service.getStuffingExecutionData(
        101,
        { userId: 7, companyId: 1 },
        '101,102,103',
      );

      expect(res.isMultiShipment).toBe(true);
      expect(res.multiShipmentMode).toBe('truck');
      expect(res.autoPopulated.quantityMt).toBe(66);
      expect(res.autoPopulated.freightForwarder).toBe('');
      expect(res.perShipmentFreights).toHaveLength(3);
      expect(res.perShipmentFreights[0].quoteNumber).toBe('FQ-101');
      expect(res.perShipmentFreights[1].quoteNumber).toBe('FQ-102');
      expect(res.readyForShipment).toBe(true);
    });

    it('rejects multi-shipment stuffing load for non-Truck/non-Rail modes such as Sea or Air', async () => {
      for (const mode of ['sea', 'air', 'bulk']) {
        mockShipmentModel.findAll.mockResolvedValue(buildShipments(mode));
        await expect(
          service.getStuffingExecutionData(101, { userId: 7 }, '101,102'),
        ).rejects.toThrow(
          'Multi-shipment execution is supported only for Truck and Rail Freight / Wagon shipments.',
        );
      }
    });

    it('completes all selected Rail Freight / Wagon shipments in one shared execution session without altering Truck/other modes', async () => {
      const shipments = buildShipments('Rail Freight / Wagon');
      jest.spyOn(service, 'assertCanModifyStuffing').mockResolvedValue({
        allowed: true,
        isCompleted: false,
        isOverride: false,
        isOneTimeEdit: false,
      });
      mockContractModel.findByPk = jest.fn().mockResolvedValue({
        id: 50,
        companyId: 1,
        originTransportMode: 'rail',
      });
      mockShipmentModel.findAll.mockResolvedValue(shipments);
      mockSequelize.transaction.mockImplementation((cb: any) =>
        cb({ LOCK: { UPDATE: 'UPDATE' } }),
      );

      const savedPayloads: any[] = [];
      let stuffingSeq = 900;
      mockStuffingModel.findOrCreate = jest.fn(({ defaults }: any) => {
        const rec: any = {
          id: ++stuffingSeq,
          ...defaults,
          update: jest.fn((vals: any) => {
            Object.assign(rec, vals);
            savedPayloads.push(vals);
            return Promise.resolve(rec);
          }),
        };
        return Promise.resolve([rec, true]);
      });

      const result: any = await service.saveStuffingExecution(
        101,
        {
          shipmentIds: [101, 102, 103],
          action: 'complete',
          loadingDate: '2026-11-26',
          loadingStartTime: '09:00',
          loadingEndTime: '15:00',
          actualLoadingWeight: 66,
          grossWeight: 68,
          netWeight: 66,
          dispatchMode: 'truck',
          freightOverrides: { freightForwarder: 'Rail Corp', shipmentMode: 'Wagon' },
          trucks: [
            {
              truckNo: 'WGN-01',
              driver: 'Covered Wagon',
              mobile: 'BOXN-9001',
              remark: 'Sealed',
              dispatch: 'Yes',
            },
          ],
          attachments: [],
          autoPopulated: { transportMode: 'Rail' },
        },
        { id: 7, userId: 7, companyId: 1 },
      );

      expect(result.isMultiShipment).toBe(true);
      expect(result.shipmentIds).toEqual([101, 102, 103]);
      expect(savedPayloads).toHaveLength(3);
      expect(savedPayloads.map((p) => p.actualLoadingWeight)).toEqual([22, 22, 22]);
      expect(savedPayloads[0].trucks[0]).toMatchObject({
        truckNo: 'WGN-01',
        driver: 'Covered Wagon',
        mobile: 'BOXN-9001',
        dispatch: 'Yes',
      });
      expect(shipments.every((s) => s.status === 'Executed')).toBe(true);
      expect(mockAuditService.writeLog).toHaveBeenCalledTimes(3);
    });

    it('rejects completion when combined actualLoadingWeight exceeds combined selected shipment quantity', async () => {
      const shipments = buildShipments('road');
      jest.spyOn(service, 'assertCanModifyStuffing').mockResolvedValue({
        allowed: true,
        isCompleted: false,
        isOverride: false,
        isOneTimeEdit: false,
      });
      mockContractModel.findByPk = jest.fn().mockResolvedValue({
        id: 50,
        companyId: 1,
        originTransportMode: 'road',
      });
      mockShipmentModel.findAll.mockResolvedValue(shipments);
      mockSequelize.transaction.mockImplementation((cb: any) =>
        cb({ LOCK: { UPDATE: 'UPDATE' } }),
      );

      await expect(
        service.saveStuffingExecution(101, {
          shipmentIds: [101, 102, 103],
          action: 'complete',
          loadingDate: '2026-11-26',
          loadingStartTime: '09:00',
          loadingEndTime: '15:00',
          actualLoadingWeight: 67,
          grossWeight: 69,
          netWeight: 67,
          dispatchMode: 'truck',
          trucks: [{ truckNo: 'TRK-1', dispatch: 'Yes' }],
        }),
      ).rejects.toThrow(
        'Loaded quantity (67 MT) exceeds combined selected shipment quantity (66 MT).',
      );
    });

    it('logs compared Sales Contract values and rejects multi-shipment execution when selected shipments belong to different Sales Contracts', async () => {
      const shipments = buildShipments('road');
      shipments[1].salesContractId = 99;
      shipments[1].salesContract = {
        ...shipments[1].salesContract,
        id: 99,
        contractNumber: 'SC-OTHER',
      };
      mockShipmentModel.findAll.mockResolvedValue(shipments);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        await expect(
          service.getStuffingExecutionData(101, { userId: 7 }, '101,102'),
        ).rejects.toThrow(
          'Multi-shipment execution is allowed only for shipments belonging to the same Sales Contract.',
        );

        expect(warnSpy).toHaveBeenCalledWith(
          '[MultiStuffingExecution:getMultiStuffingExecutionData] Sales Contract validation failed:',
          expect.objectContaining({
            comparedContractIds: [50, 99],
            shipments: expect.arrayContaining([
              expect.objectContaining({
                shipmentId: 101,
                comparedSalesContractId: 50,
              }),
              expect.objectContaining({
                shipmentId: 102,
                comparedSalesContractId: 99,
              }),
            ]),
          }),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
