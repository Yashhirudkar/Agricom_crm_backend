import {
  distributeMultiShipmentWeights,
  getMultiExecutionTransportCategory,
  parseMultiExecutionShipmentIds,
} from './multi-stuffing-execution.util';

describe('multi-stuffing-execution.util', () => {
  describe('parseMultiExecutionShipmentIds', () => {
    it('returns deduplicated anchor-first IDs only when multiple valid IDs include anchor', () => {
      expect(parseMultiExecutionShipmentIds('101, 102, 103, 102', 101)).toEqual([
        101, 102, 103,
      ]);
      expect(parseMultiExecutionShipmentIds([102, 103], 102)).toEqual([102, 103]);
      expect(parseMultiExecutionShipmentIds('101', 101)).toEqual([]);
      expect(parseMultiExecutionShipmentIds([102, 103], 101)).toEqual([]);
      expect(parseMultiExecutionShipmentIds(undefined, 101)).toEqual([]);
    });
  });

  describe('getMultiExecutionTransportCategory', () => {
    it('allows Truck (road/truck) and Rail Freight / Wagon only', () => {
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'road' }),
      ).toBe('truck');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'truck' }),
      ).toBe('truck');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'rail' }),
      ).toBe('rail');
      expect(
        getMultiExecutionTransportCategory({
          originTransportMode: 'Rail Freight / Wagon',
        }),
      ).toBe('rail');
    });

    it('supports Sea, Air, Bulk, Container, Courier, and fallback modes in the unified multi-shipment pipeline', () => {
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'sea' }),
      ).toBe('sea');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'Sea Freight' }),
      ).toBe('sea');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'container' }),
      ).toBe('sea');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'FCL' }),
      ).toBe('sea');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'air' }),
      ).toBe('air');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'Air Freight' }),
      ).toBe('air');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'bulk' }),
      ).toBe('bulk');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'Bulk Vessel' }),
      ).toBe('bulk');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: 'courier' }),
      ).toBe('courier');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: '' }),
      ).toBe('sea');
      expect(
        getMultiExecutionTransportCategory({ originTransportMode: null }),
      ).toBe('sea');
    });
  });

  describe('distributeMultiShipmentWeights', () => {
    it('distributes exact weights equally for matching Truck/Rail shipment quantities', () => {
      const allocations = distributeMultiShipmentWeights(66, 68, 66, [
        { id: 1, shipmentReference: 'SHP-1', quantity: 22 },
        { id: 2, shipmentReference: 'SHP-2', quantity: 22 },
        { id: 3, shipmentReference: 'SHP-3', quantity: 22 },
      ]);

      expect(allocations).toEqual([
        {
          shipmentId: 1,
          shipmentReference: 'SHP-1',
          quantity: 22,
          actualLoadingWeight: 22,
          grossWeight: 22.667,
          netWeight: 22,
        },
        {
          shipmentId: 2,
          shipmentReference: 'SHP-2',
          quantity: 22,
          actualLoadingWeight: 22,
          grossWeight: 22.667,
          netWeight: 22,
        },
        {
          shipmentId: 3,
          shipmentReference: 'SHP-3',
          quantity: 22,
          actualLoadingWeight: 22,
          grossWeight: 22.666,
          netWeight: 22,
        },
      ]);
      const sumActual = allocations.reduce(
        (sum, a) => sum + a.actualLoadingWeight,
        0,
      );
      expect(sumActual).toBe(66);
    });

    it('respects individual shipment quantity caps for remainder rows', () => {
      const allocations = distributeMultiShipmentWeights(140, 145, 140, [
        { id: 11, shipmentReference: 'W-1', quantity: 60 },
        { id: 12, shipmentReference: 'W-2', quantity: 60 },
        { id: 13, shipmentReference: 'W-3', quantity: 20 },
      ]);

      expect(allocations[0].actualLoadingWeight).toBeLessThanOrEqual(60);
      expect(allocations[1].actualLoadingWeight).toBeLessThanOrEqual(60);
      expect(allocations[2].actualLoadingWeight).toBeLessThanOrEqual(20);
      expect(
        allocations.reduce((sum, a) => sum + a.actualLoadingWeight, 0),
      ).toBe(140);
    });
  });
});
