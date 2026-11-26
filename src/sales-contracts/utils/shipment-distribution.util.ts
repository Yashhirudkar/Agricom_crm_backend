/**
 * Checks whether Product Qty is an exact multiple of Qty Per Count.
 * Handles floating point precision cleanly.
 *
 * @param totalProductQty
 * @param qtyPerCount
 * @returns boolean
 */
export function isDivisible(
  totalProductQty: number | string,
  qtyPerCount: number | string,
): boolean {
  const total = parseFloat(String(totalProductQty)) || 0;
  const perCount = parseFloat(String(qtyPerCount)) || 0;
  if (total <= 0 || perCount <= 0) return false;
  const quotient = Math.round((total / perCount) * 1000000) / 1000000;
  return (
    Number.isInteger(quotient) ||
    Math.abs(quotient - Math.round(quotient)) < 0.0001
  );
}

export interface DistributeShipmentOptions {
  allowRemainder?: boolean;
}

/**
 * Centralized utility to distribute a total product quantity across shipments using Qty Per Count.
 *
 * Default Business Rule (non-Rail modes):
 * Shipment Qty must ALWAYS equal Qty Per Count.
 * Every shipment must contain exactly Qty Per Count.
 * Partial/remaining shipment is NOT allowed.
 *
 * If Product Qty % Qty Per Count !== 0 and allowRemainder is false, returns an empty array.
 * When allowRemainder is true (e.g. Rail Freight / Wagon), full chunks of Qty Per Count
 * are followed by any positive remainder so total quantity is preserved.
 *
 * @param totalProductQty - Total quantity from product items in MT
 * @param qtyPerCount - Qty Per Count per shipment in MT
 * @param options - Optional distribution flags
 * @returns Array of shipment quantities
 */
export function distributeShipmentQuantities(
  totalProductQty: number | string,
  qtyPerCount?: number | string | null,
  options: DistributeShipmentOptions = {},
): number[] {
  const total = Math.max(0, parseFloat(String(totalProductQty)) || 0);
  const perCount =
    qtyPerCount != null && parseFloat(String(qtyPerCount)) > 0
      ? parseFloat(String(qtyPerCount))
      : 0;

  if (total === 0 || perCount === 0) {
    return [];
  }

  if (isDivisible(total, perCount)) {
    const count = Math.round(total / perCount);
    return Array.from({ length: count }, () => perCount);
  }

  if (!options.allowRemainder) {
    return [];
  }

  const fullCount = Math.floor(total / perCount);
  const remainder = Math.round((total - fullCount * perCount) * 1000000) / 1000000;
  const quantities = Array.from({ length: fullCount }, () => perCount);
  if (remainder > 0.0001) {
    quantities.push(remainder);
  }
  return quantities;
}
