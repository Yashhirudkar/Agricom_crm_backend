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
      mockCargoAllocationModel,
      mockCargoLoadingModel,
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
        { id: 10, selectedFreightId: 99, status: 'Preferred Quote Selected' },
      ]);

      const shipment = {
        id: 1,
        quantity: 50,
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

    it('should return System Ready = NO, Final Ready = NO when cargo is pending', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 3,
        quantity: 100,
        logisticsId: null,
        freight: 1200,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons).toEqual(['Cargo allocation is pending.']);
    });

    it('should return System Ready = NO, Final Ready = NO when both are pending', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([]);
      mockCargoLoadingModel.findAll.mockResolvedValue([]);
      mockLogisticsModel.findAll.mockResolvedValue([]);

      const shipment = {
        id: 4,
        quantity: 100,
        logisticsId: null,
        freight: null,
        manualReadyOverride: null,
      };

      const result = await service.evaluate(shipment);
      expect(result.systemReady).toBe(false);
      expect(result.readyForShipment).toBe(false);
      expect(result.isManualOverride).toBe(false);
      expect(result.readySource).toBe('System');
      expect(result.reasons).toEqual(['Cargo and Freight allocations are pending.']);
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
        { id: 30, selectedFreightId: 88, status: 'Preferred Quote Selected' },
      ]);

      const shipment = {
        id: 6,
        quantity: 100,
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
      expect(result.reasons).toEqual(['Manual override blocked: Customs hold on commodity port']);
    });

    it('System Ready = YES, Manual Override = NULL -> Final Ready = YES (System)', async () => {
      mockCargoAllocationModel.findAll.mockResolvedValue([
        { shipmentId: 7, allocatedQty: 100, status: 'Active' },
      ]);
      mockLogisticsModel.findAll.mockResolvedValue([
        { id: 40, selectedFreightId: 99, status: 'Preferred Quote Selected' },
      ]);

      const shipment = {
        id: 7,
        quantity: 100,
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
  });
});
