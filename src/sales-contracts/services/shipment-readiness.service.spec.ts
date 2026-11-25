import { ShipmentReadinessService } from './shipment-readiness.service';

describe('ShipmentReadinessService', () => {
  let service: ShipmentReadinessService;
  let mockCargoAllocationModel: any;
  let mockCargoLoadingModel: any;
  let mockLogisticsModel: any;
  let mockFreightQuoteModel: any;

  beforeEach(() => {
    mockCargoAllocationModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockCargoLoadingModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockLogisticsModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockFreightQuoteModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    service = new ShipmentReadinessService(
      mockLogisticsModel,
      mockFreightQuoteModel,
    );
  });

  describe('Automatic System Readiness (No Override)', () => {
    it('should return System Ready = YES, Final Ready = YES when both cargo and freight are ready', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 1, allocatedQty: 50, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 10, selectedFreightId: 99, status: 'Transport Assigned' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 99,
          logisticsId: 10,
          shipmentId: 1,
          isPreferred: true,
          isRejected: false,
        },
      ]);

      const shipment = {
        id: 1,
        quantity: 50,
        cargoReadyConfirmed: true,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: 10,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(true);
      expect(result.readyForShipment).toBe(true);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons.length).toBe(0);
    });

    it('keeps cargo ready after an explicit confirmation when allocations are no longer active', async () => {
      const shipment = {
        id: 20,
        quantity: 50,
        cargoReadyConfirmed: true,
        freightRequired: false,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);

      expect(result.cargoReady).toBe(true);
      expect(result.systemReady).toBe(true);
      expect(result.readyForShipment).toBe(true);
    });

    it('honors an explicit Not Ready selection even when loading data exists', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 21, allocatedQty: 50, status: 'Active' },
      ]);
      mockCargoLoadingModel.findAll.mockResolvedValue([
        { shipmentId: 21, loadedQty: 50 },
      ]);

      const result = await service.evaluate({
        id: 21,
        quantity: 50,
        cargoReadyConfirmed: false,
        freightRequired: false,
        manualReadyOverride: null,
      });

      expect(result.cargoReady).toBe(false);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
    });

    it('should return System Ready = NO, Final Ready = NO when freight is pending', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 2, allocatedQty: 100, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 20, selectedFreightId: null, status: 'Pending' },
      ]);

      const shipment = {
        id: 2,
        quantity: 100,
        cargoReadyConfirmed: true,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: 20,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons).toEqual(['Freight allocation is pending.']);
    });

    it('should return System Ready = NO, Final Ready = NO when cargo and freight are pending', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 3,
        quantity: 100,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: null,
        freight: 1200,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons).toEqual([
        'Cargo and Freight allocations are pending.',
      ]);
    });

    it('should return System Ready = NO, Final Ready = NO when both are pending', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 4,
        quantity: 100,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: null,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons).toEqual([
        'Cargo and Freight allocations are pending.',
      ]);
    });
  });

  describe('Manual Readiness Override Layer', () => {
    it('System Ready = NO, Manual Override = YES -> Final Ready = YES (Manual)', async () => {
      // Neither cargo nor freight ready
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 5,
        quantity: 100,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: null,
        freight: null,
        manualReadyOverride: true,
        manualReadyReason: 'Urgent export shipment approved by director',
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(true);
      expect(result.isManualOverride).toBe(true);
      expect(result.readySource).toBe('Manual');
      expect(result.manualReadyOverride).toBe(true);
      expect(result.reasons.length).toBe(0);
    });

    it('System Ready = YES, Manual Override = NO -> Final Ready = NO (Manual)', async () => {
      // Both cargo and freight ready
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 6, allocatedQty: 100, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 30, selectedFreightId: 88, status: 'Transport Assigned' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 88,
          logisticsId: 30,
          shipmentId: 6,
          isPreferred: true,
          isRejected: false,
        },
      ]);

      const shipment = {
        id: 6,
        quantity: 100,
        cargoReadyConfirmed: true,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: 30,
        freight: null,
        manualReadyOverride: false,
        manualReadyReason: 'Customs hold on commodity port',
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(true);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(true);
      expect(result.readySource).toBe('Manual');
      expect(result.manualReadyOverride).toBe(false);
      expect(result.reasons).toEqual([
        'Manual override blocked: Customs hold on commodity port',
      ]);
    });

    it('System Ready = YES, Manual Override = NULL -> Final Ready = YES (System)', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 7, allocatedQty: 100, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 40, selectedFreightId: 99, status: 'Transport Assigned' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 99,
          logisticsId: 40,
          shipmentId: 7,
          isPreferred: true,
          isRejected: false,
        },
      ]);

      const shipment = {
        id: 7,
        quantity: 100,
        cargoReadyConfirmed: true,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: 40,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(true);
      expect(result.readyForShipment).toBe(true);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
    });

    it('System Ready = NO, Manual Override = NULL -> Final Ready = NO (System)', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 8,
        quantity: 100,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: null,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
    });

    it('returns Freight Allocation YES after a shipment quote is assigned', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 99, allocatedQty: 50, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 100, selectedFreightId: 100, status: 'Transport Assigned' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 100,
          logisticsId: 100,
          shipmentId: 99,
          isPreferred: true,
          isRejected: false,
        },
      ]);

      const shipment = {
        id: 99,
        quantity: 50,
        cargoReadyConfirmed: true,
        freightRequired: true,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
        logisticsId: 100,
        freightAllocationStatus: 'Yes',
      };

      const result = await service.evaluate(shipment);
      expect(result.freightReady).toBe(true);
      expect(result.isFreightNotApplicable).toBe(false);
      expect(result.freightAllocationStatus).toBe('Yes');
      expect(result.systemReady).toBe(true);
      expect(result.readyForShipment).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('completes Freight Allocation when a freight quote exists for the shipment', async () => {
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 108, selectedFreightId: 208, status: 'Quotes Received' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 208,
          logisticsId: 108,
          shipmentId: 109,
          isPreferred: false,
          isRejected: false,
        },
      ]);

      const result = await service.evaluate({
        id: 109,
        logisticsId: 108,
        freightRequired: true,
      });

      expect(result.freightReady).toBe(true);
      expect(result.freightAllocationStatus).toBe('Yes');
    });

    it('does not complete Freight Allocation when no freight quote exists for the shipment', async () => {
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 108, selectedFreightId: null, status: 'Pending' },
      ]);
      mockFreightQuoteModel.findAll.mockResolvedValue([]);

      const result = await service.evaluate({
        id: 109,
        logisticsId: 108,
        freightRequired: true,
      });

      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
    });

    it('evaluates Freight Allocation strictly per shipment when multiple shipments share the same Purchase Contract', async () => {
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 50, selectedFreightId: null, status: 'Quotes Received' },
      ]);
      // Only Shipment #4 has a quote
      mockFreightQuoteModel.findAll.mockResolvedValue([
        {
          id: 400,
          logisticsId: 50,
          purchaseContractId: 20,
          shipmentId: 4,
          isPreferred: false,
          isRejected: false,
        },
      ]);

      const shipments = [
        {
          id: 1,
          purchaseContractId: 20,
          logisticsId: 50,
          freightRequired: true,
        },
        {
          id: 2,
          purchaseContractId: 20,
          logisticsId: 50,
          freightRequired: true,
        },
        {
          id: 3,
          purchaseContractId: 20,
          logisticsId: 50,
          freightRequired: true,
        },
        {
          id: 4,
          purchaseContractId: 20,
          logisticsId: 50,
          freightRequired: true,
        },
      ];

      const batchMap = await service.evaluateBatch(shipments);

      expect(batchMap.get(1)?.freightAllocationStatus).toBe('No');
      expect(batchMap.get(1)?.freightReady).toBe(false);

      expect(batchMap.get(2)?.freightAllocationStatus).toBe('No');
      expect(batchMap.get(2)?.freightReady).toBe(false);

      expect(batchMap.get(3)?.freightAllocationStatus).toBe('No');
      expect(batchMap.get(3)?.freightReady).toBe(false);

      expect(batchMap.get(4)?.freightAllocationStatus).toBe('Yes');
      expect(batchMap.get(4)?.freightReady).toBe(true);
    });

    it('uses the matrix result rather than a stale Freight Required snapshot', async () => {
      const result = await service.evaluate({
        id: 110,
        freightRequired: false,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
      });

      expect(result.freightRequired).toBe(true);
      expect(result.freightAllocationStatus).toBe('No');
    });

    it('returns Freight Allocation NO when freight is not required', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 100,
        quantity: 50,
        shipmentType: { purchaseContractDeliveryPlaceRequired: false },
      };

      const result = await service.evaluate(shipment);
      expect(result.freightReady).toBe(false);
      expect(result.isFreightNotApplicable).toBe(true);
      expect(result.freightAllocationStatus).toBe('No');
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.reasons).toEqual(['Cargo allocation is pending.']);
    });

    it('Freight Compatibility Matrix: PC = FCA, SC = FCA -> allocation remains NO until transport assignment', async () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 101, allocatedQty: 50, status: 'Active' },
      ]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 101,
        quantity: 50,
        cargoReadyConfirmed: true,
        purchaseContract: { shipmentType: { sequence: 2, code: 'FCA' } },
        salesContract: { shipmentType: { sequence: 2, code: 'FCA' } },
      };

      const result = await service.evaluate(shipment);
      expect(result.freightReady).toBe(false);
      expect(result.freightRequired).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
      expect(result.systemReady).toBe(true);
      expect(debugSpy).toHaveBeenCalledWith(
        '[FreightCompatibilityMatrix]',
        expect.objectContaining({
          shipmentId: 101,
          salesContractIncoterm: 'FCA',
          purchaseContractIncoterm: 'FCA',
          matrixResult: false,
          freightRequired: false,
        }),
      );
      debugSpy.mockRestore();
    });

    it('does not mark Freight Allocation YES for FCA before transport assignment', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 102, allocatedQty: 50, status: 'Active' },
      ]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 102,
        quantity: 50,
        purchaseContract: { shipmentType: { sequence: 2, code: 'FCA' } },
        salesContract: { shipmentType: { sequence: 4, code: 'FOB' } },
        freight: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.freightRequired).toBe(true);
      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
      expect(result.systemReady).toBe(false);
      expect(result.reasons).toContain('Cargo and Freight allocations are pending.');
    });

    it('does not mark Freight Allocation YES when the Sales Contract term is FCA before assignment', async () => {
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const result = await service.evaluate({
        id: 107,
        quantity: 50,
        purchaseContract: { shipmentType: { sequence: 1, code: 'EXW' } },
        salesContract: { shipmentType: { sequence: 2, code: 'FCA' } },
      });

      expect(result.freightRequired).toBe(true);
      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
    });

    it('does not treat a freight amount or stored Yes as a completed allocation', async () => {
      const shipment = {
        id: 104,
        quantity: 50,
        purchaseContract: { shipmentType: { sequence: 1, code: 'EXW' } },
        salesContract: { shipmentType: { sequence: 4, code: 'FOB' } },
        freight: 1200,
        freightAllocationStatus: 'Yes',
      };

      const result = await service.evaluate(shipment);
      expect(result.freightRequired).toBe(true);
      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
      expect(result.systemReady).toBe(false);
    });

    it('does not treat a generic logistics status as transport assignment', async () => {
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 50, selectedFreightId: null, status: 'Completed' },
      ]);

      const result = await service.evaluate({
        id: 105,
        businessTransactionId: 500,
        purchaseContract: { shipmentType: { code: 'EXW' } },
        salesContract: { shipmentType: { code: 'FOB' } },
      });

      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
    });

    it('uses the Purchase Contract linked through the Sales Contract for the freight rule', async () => {
      const sequelize = {
        query: jest.fn().mockResolvedValue([
          {
            shipment_id: 106,
            pc_id: 60,
            pc_st_id: 2,
            pc_st_code: 'EXW',
            sc_st_id: 4,
            sc_st_code: 'FOB',
          },
        ]),
      };
      service = new ShipmentReadinessService(
        mockLogisticsModel,
        mockFreightQuoteModel,
        sequelize as any,
      );

      const result = await service.evaluate({
        id: 106,
        salesContractId: 10,
        salesContract: { shipmentType: { code: 'FOB' } },
      });

      expect(result.freightRequired).toBe(true);
      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
    });

    it('Future-proof Sequence: PC = seq 11, SC = seq 12 -> Freight Required = YES', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 103, allocatedQty: 50, status: 'Active' },
      ]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 103,
        quantity: 50,
        purchaseContract: { shipmentType: { sequence: 11, code: 'DDP' } },
        salesContract: { shipmentType: { sequence: 12, code: 'NEW12' } },
        freight: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.freightReady).toBe(false);
      expect(result.freightAllocationStatus).toBe('No');
    });
  });
});
