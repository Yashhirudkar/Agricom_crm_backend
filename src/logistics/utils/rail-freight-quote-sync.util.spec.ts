import {
  SHIPMENTS_MANAGEMENT_SYNC_SOURCE,
  buildSiblingFreightQuotePayload,
  capturePreUpdateQuoteSnapshot,
  extractUniqueSiblingShipmentIds,
  findMatchingSiblingQuote,
  isRailOriginTransportMode,
  stripRailSyncControlFields,
} from './rail-freight-quote-sync.util';

describe('rail-freight-quote-sync.util', () => {
  describe('isRailOriginTransportMode', () => {
    it('returns true strictly for Rail Freight / Wagon origin transport modes', () => {
      expect(isRailOriginTransportMode({ originTransportMode: 'rail' })).toBe(true);
      expect(isRailOriginTransportMode({ originTransportMode: 'RAIL' })).toBe(true);
      expect(isRailOriginTransportMode({ originTransportMode: 'Rail Freight / Wagon' })).toBe(true);
      expect(isRailOriginTransportMode({ originTransportMode: 'wagon' })).toBe(true);
    });

    it('returns false for Sea, Road, Truck, Bulk Vessel, Air, Courier, and missing values', () => {
      expect(isRailOriginTransportMode({ originTransportMode: 'sea' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'Sea Freight' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'road' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'Truck' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'bulk' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'Bulk Vessel' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'air' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: 'Courier' })).toBe(false);
      expect(isRailOriginTransportMode({ originTransportMode: null })).toBe(false);
      expect(isRailOriginTransportMode({ destinationTransportMode: 'rail' } as any)).toBe(false);
    });
  });

  describe('extractUniqueSiblingShipmentIds', () => {
    it('returns sibling IDs only when multiple valid shipments including source are selected', () => {
      expect(extractUniqueSiblingShipmentIds([101, 102, 103, 102], 101)).toEqual([102, 103]);
      expect(extractUniqueSiblingShipmentIds([101], 101)).toEqual([]);
      expect(extractUniqueSiblingShipmentIds([102], 101)).toEqual([]);
      expect(extractUniqueSiblingShipmentIds([], 101)).toEqual([]);
      expect(extractUniqueSiblingShipmentIds([102, 103], 101)).toEqual([]);
    });
  });

  describe('buildSiblingFreightQuotePayload', () => {
    it('copies business fields without copying source IDs, quoteNumber, shipmentId, or audit timestamps', () => {
      const dto: any = {
        id: 999,
        uuid: 'source-uuid',
        quoteNumber: 'FQ/2026/000001',
        shipmentId: 101,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        syncWorkflowSource: SHIPMENTS_MANAGEMENT_SYNC_SOURCE,
        syncShipmentIds: [101, 102],
        quoteDate: '2026-06-01',
        sellerId: 55,
        wagonType: 'Covered Wagon',
        wagonCapacity: '60 MT',
        vehicleType: 'Covered Wagon',
        currency: 'USD',
        freightAmount: 4500,
        transitDays: 6,
        validityDate: '2026-06-15',
        remarks: 'Rake freight',
        origin: 'Kota Junction',
        destination: 'Mundra Port',
      };

      const cleanDto = stripRailSyncControlFields(dto);
      expect(cleanDto).not.toHaveProperty('syncWorkflowSource');
      expect(cleanDto).not.toHaveProperty('syncShipmentIds');

      const payload = buildSiblingFreightQuotePayload({
        dto,
        calculatedFreightAmount: 4500,
        resolvedPaymentTerm: { paymentTermId: 9, paymentTerms: 'Net 15' },
        isUpdate: false,
        userId: 7,
        companyId: 2,
        destShipment: {
          id: 102,
          shipmentNo: 2,
          shipmentSequence: 2,
          businessTransactionId: 88,
        },
        destLogisticsId: 300,
        destPurchaseContractId: 400,
        quoteNumber: 'FQ/2026/000002',
      });

      expect(payload).not.toHaveProperty('id');
      expect(payload).not.toHaveProperty('uuid');
      expect(payload).not.toHaveProperty('createdAt');
      expect(payload).not.toHaveProperty('updatedAt');
      expect(payload.quoteNumber).toBe('FQ/2026/000002');
      expect(payload.shipmentId).toBe(102);
      expect(payload.logisticsId).toBe(300);
      expect(payload.purchaseContractId).toBe(400);
      expect(payload.businessTransactionId).toBe(88);
      expect(payload.wagonType).toBe('Covered Wagon');
      expect(payload.wagonCapacity).toBe('60 MT');
      expect(payload.freightAmount).toBe(4500);
      expect(payload.currency).toBe('USD');
      expect(payload.paymentTermId).toBe(9);
      expect(payload.paymentTerms).toBe('Net 15');
      expect(payload.remarks).toBe('Rake freight');
      expect(payload.version).toBe(1);
      expect(payload.isPreferred).toBe(false);
    });
  });

  describe('findMatchingSiblingQuote', () => {
    it('matches the pre-edit sibling twin accurately without overwriting unrelated carrier quotes', () => {
      const snapshot = capturePreUpdateQuoteSnapshot(
        {
          id: 10,
          sellerId: 55,
          quoteDate: '2026-06-01',
          freightAmount: 4500,
          currency: 'USD',
          wagonType: 'Covered Wagon',
          wagonCapacity: '60 MT',
          transitDays: 6,
          validityDate: '2026-06-15',
          remarks: 'Initial quote',
          version: 1,
        },
        [{ chargeName: 'Basic Freight', amount: 4500, displayOrder: 1 }],
      );

      const candidateOtherCarrier = {
        id: 21,
        sellerId: 88,
        quoteDate: '2026-06-01',
        freightAmount: 4500,
        currency: 'USD',
        wagonType: 'Covered Wagon',
        wagonCapacity: '60 MT',
        version: 1,
        isRejected: false,
      };

      const candidateSameCarrierOtherWagon = {
        id: 22,
        sellerId: 55,
        quoteDate: '2026-06-01',
        freightAmount: 7000,
        currency: 'USD',
        wagonType: 'Flat Wagon',
        wagonCapacity: '50 MT',
        version: 1,
        isRejected: false,
      };

      const candidateTwin = {
        id: 23,
        sellerId: 55,
        quoteDate: '2026-06-01',
        freightAmount: 4500,
        currency: 'USD',
        wagonType: 'Covered Wagon',
        wagonCapacity: '60 MT',
        transitDays: 6,
        validityDate: '2026-06-15',
        remarks: 'Initial quote',
        version: 1,
        isRejected: false,
        charges: [{ chargeName: 'Basic Freight', amount: 4500, displayOrder: 1 }],
      };

      const matched = findMatchingSiblingQuote(
        [candidateOtherCarrier, candidateSameCarrierOtherWagon, candidateTwin],
        snapshot,
      );
      expect(matched?.id).toBe(23);
    });
  });
});
