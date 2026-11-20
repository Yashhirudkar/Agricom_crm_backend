export const DEFAULT_TRUCK_CAPACITIES: string[] = [
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
  '25 MT',
  '30 MT',
  '35 MT',
  '40 MT',
];

/**
 * Normalizes any truck capacity input into canonical '<NUMBER> MT' format.
 * - Handles numbers: 22 -> '22 MT', 22.5 -> '22.5 MT'
 * - Handles suffixes (case-insensitive, trims extra spaces):
 *   '22 mt', '22MT', '22 Mt', ' 22   MT ' -> '22 MT'
 * - Handles 'ton', 'tonnes', 'metric tons', 'm.t.':
 *   '22 metric tons' -> '22 MT'
 * - Returns empty string if input is null, undefined, or empty.
 */
export function normalizeTruckCapacity(
  val: string | number | null | undefined,
): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';

  // 1. Direct regex for number optionally followed by unit
  const match = str.match(
    /^([\d.]+)\s*(?:mt|m\.t\.|metric\s*tons?|tonnes?|tons?)?\.?$/i,
  );
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num > 0) {
      const formattedNum = Number.isInteger(num)
        ? String(num)
        : String(parseFloat(num.toFixed(2)));
      return `${formattedNum} MT`;
    }
  }

  // 2. Regex for prefix unit like 'MT 22' or 'Ton 22'
  const altMatch = str.match(/(?:mt|tons?|tonnes?)?\s*([\d.]+)/i);
  if (altMatch) {
    const num = parseFloat(altMatch[1]);
    if (!isNaN(num) && num > 0) {
      const formattedNum = Number.isInteger(num)
        ? String(num)
        : String(parseFloat(num.toFixed(2)));
      return `${formattedNum} MT`;
    }
  }

  // 3. If it ends with MT in some variation, ensure standard format
  if (/mt$/i.test(str)) {
    return str.replace(/mt$/i, 'MT').replace(/\s+/g, ' ').trim();
  }

  // 4. Default fallback: append MT if purely numeric or general string
  return `${str} MT`;
}

/**
 * Extracts numeric value of capacity for numerical sorting.
 */
export function extractCapacityNumber(
  val: string | number | null | undefined,
): number {
  if (!val) return 0;
  const match = String(val).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * Canonical comparison key: lowercased, stripped of spaces and periods.
 * e.g. '22 MT' -> '22mt', '22mt' -> '22mt', '22' -> '22mt'
 */
export function canonicalCapacityKey(
  val: string | number | null | undefined,
): string {
  const norm = normalizeTruckCapacity(val);
  return norm.toLowerCase().replace(/[\s.]+/g, '');
}

/**
 * Normalizes and deduplicates a list of truck capacities.
 * Comparison ignores case, extra spaces, and formats.
 * Preserves default capacities and sorts numerically.
 */
export function normalizeAndDeduplicateCapacities(
  list: (string | number | null | undefined)[] = [],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of list) {
    const norm = normalizeTruckCapacity(item);
    if (!norm) continue;
    const key = canonicalCapacityKey(norm);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(norm);
    }
  }

  return result.sort((a, b) => extractCapacityNumber(a) - extractCapacityNumber(b));
}
