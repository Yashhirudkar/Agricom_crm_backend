import {
  normalizeTruckCapacity,
  extractCapacityNumber,
  canonicalCapacityKey,
  normalizeAndDeduplicateCapacities,
  DEFAULT_TRUCK_CAPACITIES,
} from './truck-capacity.util';

describe('truck-capacity.util', () => {
  describe('normalizeTruckCapacity', () => {
    it('should convert pure numbers to <NUMBER> MT', () => {
      expect(normalizeTruckCapacity('22')).toBe('22 MT');
      expect(normalizeTruckCapacity(22)).toBe('22 MT');
      expect(normalizeTruckCapacity('40')).toBe('40 MT');
      expect(normalizeTruckCapacity(40)).toBe('40 MT');
      expect(normalizeTruckCapacity('2.5')).toBe('2.5 MT');
    });

    it('should normalize various case and whitespace variants to <NUMBER> MT', () => {
      expect(normalizeTruckCapacity('22 mt')).toBe('22 MT');
      expect(normalizeTruckCapacity('22MT')).toBe('22 MT');
      expect(normalizeTruckCapacity('22 Mt')).toBe('22 MT');
      expect(normalizeTruckCapacity('  22   MT  ')).toBe('22 MT');
      expect(normalizeTruckCapacity('22 m.t.')).toBe('22 MT');
      expect(normalizeTruckCapacity('22 metric ton')).toBe('22 MT');
      expect(normalizeTruckCapacity('22 tonnes')).toBe('22 MT');
      expect(normalizeTruckCapacity('22 Ton')).toBe('22 MT');
    });

    it('should handle decimals properly without trailing zero clutter', () => {
      expect(normalizeTruckCapacity('22.0 MT')).toBe('22 MT');
      expect(normalizeTruckCapacity('22.50 MT')).toBe('22.5 MT');
    });

    it('should handle empty or null values', () => {
      expect(normalizeTruckCapacity('')).toBe('');
      expect(normalizeTruckCapacity(null)).toBe('');
      expect(normalizeTruckCapacity(undefined)).toBe('');
      expect(normalizeTruckCapacity('   ')).toBe('');
    });
  });

  describe('canonicalCapacityKey', () => {
    it('should return matching key for all variations of same capacity', () => {
      const key1 = canonicalCapacityKey('22');
      const key2 = canonicalCapacityKey('22 MT');
      const key3 = canonicalCapacityKey('22 mt');
      const key4 = canonicalCapacityKey('22MT');
      const key5 = canonicalCapacityKey(' 22  Mt ');
      expect(key1).toBe('22mt');
      expect(key2).toBe('22mt');
      expect(key3).toBe('22mt');
      expect(key4).toBe('22mt');
      expect(key5).toBe('22mt');
    });
  });

  describe('normalizeAndDeduplicateCapacities', () => {
    it('should deduplicate mixed formats and sort numerically', () => {
      const input = [
        '40',
        '22 mt',
        '10 MT',
        '22MT',
        '22',
        '22 MT',
        ' 22  Mt ',
        '5 MT',
        '40 MT',
        '1 MT',
      ];
      const result = normalizeAndDeduplicateCapacities(input);
      expect(result).toEqual(['1 MT', '5 MT', '10 MT', '22 MT', '40 MT']);
    });

    it('should keep default capacities and add custom deduplicated', () => {
      const input = [...DEFAULT_TRUCK_CAPACITIES, '22', '22 mt', '10 MT', '45'];
      const result = normalizeAndDeduplicateCapacities(input);
      expect(result).toContain('22 MT');
      expect(result).toContain('45 MT');
      // No duplicate 22 MT
      expect(result.filter((x) => x === '22 MT').length).toBe(1);
      // No duplicate 10 MT
      expect(result.filter((x) => x === '10 MT').length).toBe(1);
      // Sorted numerically
      expect(result).toEqual([
        '1 MT',
        '2 MT',
        '3 MT',
        '5 MT',
        '7 MT',
        '9 MT',
        '10 MT',
        '12 MT',
        '15 MT',
        '18 MT',
        '20 MT',
        '22 MT',
        '25 MT',
        '30 MT',
        '35 MT',
        '40 MT',
        '45 MT',
      ]);
    });
  });
});
