/// <reference types="jest" />

import {
  isDivisible,
  distributeShipmentQuantities,
} from './shipment-distribution.util';

describe('shipment-distribution.util', () => {
  describe('isDivisible', () => {
    it('returns true for exact multiples including decimals', () => {
      expect(isDivisible(88, 22)).toBe(true);
      expect(isDivisible(500, 100)).toBe(true);
      expect(isDivisible(64.5, 21.5)).toBe(true);
    });

    it('returns false when quantity is not an exact multiple', () => {
      expect(isDivisible(90, 22)).toBe(false);
      expect(isDivisible(415, 37)).toBe(false);
      expect(isDivisible(10, 22)).toBe(false);
    });
  });

  describe('distributeShipmentQuantities', () => {
    it('rejects non-multiples by default (non-Rail transport modes)', () => {
      expect(distributeShipmentQuantities(90, 22)).toEqual([]);
      expect(distributeShipmentQuantities(415, 37)).toEqual([]);
      expect(distributeShipmentQuantities(88, 22)).toEqual([22, 22, 22, 22]);
    });

    it('distributes full chunks plus remainder when allowRemainder is true (Rail Freight / Wagon)', () => {
      expect(distributeShipmentQuantities(90, 22, { allowRemainder: true })).toEqual([
        22, 22, 22, 22, 2,
      ]);
      expect(distributeShipmentQuantities(500, 100, { allowRemainder: true })).toEqual([
        100, 100, 100, 100, 100,
      ]);
      expect(distributeShipmentQuantities(415, 37, { allowRemainder: true })).toEqual([
        37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 8,
      ]);
      expect(distributeShipmentQuantities(15, 22, { allowRemainder: true })).toEqual([15]);
    });
  });
});
