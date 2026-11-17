/// <reference types="jest" />

import {
  generateQuantityDescription,
  getContractItemQuantityDescription,
  normalizeTransportMode,
  formatContainerType,
  formatQuantityNumber,
  formatTolerancePercentage,
} from './quantity-description.util';

describe('quantity-description.util', () => {
  describe('normalizeTransportMode', () => {
    it('should identify road transport variants', () => {
      expect(normalizeTransportMode('ROAD')).toBe('ROAD');
      expect(normalizeTransportMode('road')).toBe('ROAD');
      expect(normalizeTransportMode('ROAD TRANSPORT')).toBe('ROAD');
      expect(normalizeTransportMode('truck')).toBe('ROAD');
    });

    it('should identify sea shipment variants', () => {
      expect(normalizeTransportMode('SEA')).toBe('SEA');
      expect(normalizeTransportMode('sea')).toBe('SEA');
      expect(normalizeTransportMode('SEA SHIPMENT')).toBe('SEA');
      expect(normalizeTransportMode('fcl')).toBe('SEA');
      expect(normalizeTransportMode('container')).toBe('SEA');
    });

    it('should identify bulk vessel variants', () => {
      expect(normalizeTransportMode('BULK')).toBe('BULK');
      expect(normalizeTransportMode('bulk vessel')).toBe('BULK');
      expect(normalizeTransportMode('in bulk')).toBe('BULK');
    });

    it('should default to SEA when undefined or empty', () => {
      expect(normalizeTransportMode(undefined)).toBe('SEA');
      expect(normalizeTransportMode('')).toBe('SEA');
    });
  });

  describe('formatContainerType', () => {
    it('should normalize 40 FT and 20 FT containers', () => {
      expect(formatContainerType('40 FT')).toBe('40 FEET');
      expect(formatContainerType('40ft')).toBe('40 FEET');
      expect(formatContainerType('20 FT')).toBe('20 FEET');
      expect(formatContainerType('20ft')).toBe('20 FEET');
      expect(formatContainerType('40 HC')).toBe('40 HC FEET');
      expect(formatContainerType(undefined)).toBe('40 FEET');
    });
  });

  describe('formatQuantityNumber', () => {
    it('should format whole numbers without decimals', () => {
      expect(formatQuantityNumber(22)).toBe('22');
      expect(formatQuantityNumber(44)).toBe('44');
      expect(formatQuantityNumber(104)).toBe('104');
      expect(formatQuantityNumber(5000)).toBe('5000');
    });

    it('should format decimals with up to 2 decimal places', () => {
      expect(formatQuantityNumber(21.5)).toBe('21.50');
      expect(formatQuantityNumber(64.5)).toBe('64.50');
      expect(formatQuantityNumber(21.25)).toBe('21.25');
    });
  });

  describe('generateQuantityDescription', () => {
    it('Requirement 1: Road Transport integer example (44 MT, 2 trucks, 22 MT each)', () => {
      const result = generateQuantityDescription({
        transportMode: 'ROAD TRANSPORT',
        unitCount: 2,
        qtyPerUnit: 22,
        totalQuantity: 44,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        '2 TRUCKS OF 22 MT EACH, TOTAL ABOUT 44 MT +/- 5%'
      );
    });

    it('Requirement 1: Road Transport decimal example (64.50 MT, 3 trucks, 21.50 MT each)', () => {
      const result = generateQuantityDescription({
        transportMode: 'ROAD',
        unitCount: 3,
        qtyPerUnit: 21.5,
        totalQuantity: 64.5,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        '3 TRUCKS OF 21.50 MT EACH, TOTAL ABOUT 64.50 MT +/- 5%'
      );
    });

    it('Requirement 1: Road Transport single truck singular label', () => {
      const result = generateQuantityDescription({
        transportMode: 'road',
        unitCount: 1,
        qtyPerUnit: 22,
        totalQuantity: 22,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        '1 TRUCK OF 22 MT EACH, TOTAL ABOUT 22 MT +/- 5%'
      );
    });

    it('Requirement 2: Sea Shipment FCL (40 FEET) example (104 MT, 4 FCL, 26 MT each)', () => {
      const result = generateQuantityDescription({
        transportMode: 'SEA',
        unitCount: 4,
        containerType: '40 FT',
        qtyPerUnit: 26,
        totalQuantity: 104,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        '4 FCL OF 40 FEET, 26 MT EACH, TOTAL ABOUT 104 MT +/- 5%'
      );
    });

    it('Requirement 2: Sea Shipment FCL (20 FEET) example (48 MT, 2 FCL, 24 MT each)', () => {
      const result = generateQuantityDescription({
        transportMode: 'SEA',
        unitCount: 2,
        containerType: '20 FT',
        qtyPerUnit: 24,
        totalQuantity: 48,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        '2 FCL OF 20 FEET, 24 MT EACH, TOTAL ABOUT 48 MT +/- 5%'
      );
    });

    it('Requirement 3: Bulk Vessel example (5000 MT, tolerance 5%)', () => {
      const result = generateQuantityDescription({
        transportMode: 'BULK',
        totalQuantity: 5000,
        tolerancePercentage: 5,
      });

      expect(result).toBe(
        'TOTAL ABOUT 5000 MT +/- 5% IN BULK'
      );
    });

    it('Requirement 3: Bulk Vessel with custom tolerance (e.g. 10%)', () => {
      const result = generateQuantityDescription({
        transportMode: 'bulk vessel',
        totalQuantity: 5000,
        tolerancePercentage: 10,
      });

      expect(result).toBe(
        'TOTAL ABOUT 5000 MT +/- 10% IN BULK'
      );
    });

    it('Auto-calculates unitCount from totalQuantity / qtyPerUnit if omitted', () => {
      const result = generateQuantityDescription({
        transportMode: 'ROAD',
        totalQuantity: 44,
        qtyPerUnit: 22,
      });

      expect(result).toBe(
        '2 TRUCKS OF 22 MT EACH, TOTAL ABOUT 44 MT +/- 5%'
      );
    });
  });

  describe('getContractItemQuantityDescription (from Shipment Schedule & Items)', () => {
    it('Road Transport: derives 2 trucks of 22 MT from 2 shipment rows', () => {
      const contract = {
        originTransportMode: 'ROAD TRANSPORT',
        shipments: [
          { quantity: 22, noOfContainers: 1 },
          { quantity: 22, noOfContainers: 1 },
        ],
      };
      const item = { quantity: 44, qtyPerCount: 22 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        '2 TRUCKS OF 22 MT EACH, TOTAL ABOUT 44 MT +/- 5%'
      );
    });

    it('Road Transport: derives 3 trucks of 21.50 MT from 3 shipment rows', () => {
      const contract = {
        originTransportMode: 'ROAD',
        shipments: [
          { quantity: 21.5, noOfContainers: 1 },
          { quantity: 21.5, noOfContainers: 1 },
          { quantity: 21.5, noOfContainers: 1 },
        ],
      };
      const item = { quantity: 64.5, qtyPerCount: 21.5 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        '3 TRUCKS OF 21.50 MT EACH, TOTAL ABOUT 64.50 MT +/- 5%'
      );
    });

    it('Sea FCL: derives 4 FCL OF 40 FEET, 22 MT EACH, TOTAL ABOUT 88 MT +/- 5%', () => {
      const contract = {
        destinationTransportMode: 'SEA',
        containerType: '40 FT',
        shipments: [
          { quantity: 22, noOfContainers: 1 },
          { quantity: 22, noOfContainers: 1 },
          { quantity: 22, noOfContainers: 1 },
          { quantity: 22, noOfContainers: 1 },
        ],
      };
      const item = { quantity: 88, qtyPerCount: 22 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        '4 FCL OF 40 FEET, 22 MT EACH, TOTAL ABOUT 88 MT +/- 5%'
      );
    });

    it('Sea FCL: derives 2 FCL OF 20 FEET, 24 MT EACH, TOTAL ABOUT 48 MT +/- 5%', () => {
      const contract = {
        destinationTransportMode: 'SEA',
        containerType: '20 FT',
        shipments: [
          { quantity: 24, noOfContainers: 1 },
          { quantity: 24, noOfContainers: 1 },
        ],
      };
      const item = { quantity: 48, qtyPerCount: 24 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        '2 FCL OF 20 FEET, 24 MT EACH, TOTAL ABOUT 48 MT +/- 5%'
      );
    });

    it('Sea FCL: derives 4 FCL OF 40 FEET, 26 MT EACH, TOTAL ABOUT 104 MT +/- 5% when schedule empty', () => {
      const contract = {
        destinationTransportMode: 'SEA',
        containerType: '40 FT',
        shipments: [],
      };
      const item = { quantity: 104, qtyPerCount: 26 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        '4 FCL OF 40 FEET, 26 MT EACH, TOTAL ABOUT 104 MT +/- 5%'
      );
    });

    it('Bulk: derives total 5000 MT in bulk', () => {
      const contract = {
        originTransportMode: 'bulk vessel',
        shipments: [{ quantity: 5000, noOfContainers: 1 }],
      };
      const item = { quantity: 5000 };

      const result = getContractItemQuantityDescription(contract, item);
      expect(result).toBe(
        'TOTAL ABOUT 5000 MT +/- 5% IN BULK'
      );
    });
  });
});

