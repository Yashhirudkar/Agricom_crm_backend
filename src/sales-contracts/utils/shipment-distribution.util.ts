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

/**
 * Centralized utility to distribute a total product quantity across shipments using Qty Per Count.
 *
 * Business Rule:
 * Shipment Qty must ALWAYS equal Qty Per Count.
 * Every shipment must contain exactly Qty Per Count.
 * Partial/remaining shipment is NOT allowed.
 *
 * If Product Qty % Qty Per Count !== 0, returns an empty array (no rows generated).
 *
 * @param totalProductQty - Total quantity from product items in MT
 * @param qtyPerCount - Qty Per Count per shipment in MT
 * @returns Array of shipment quantities (each strictly equal to qtyPerCount)
 */
export function distributeShipmentQuantities(
  totalProductQty: number | string,
  qtyPerCount?: number | string | null,
): number[] {
  const total = Math.max(0, parseFloat(String(totalProductQty)) || 0);
  const perCount =
    qtyPerCount != null && parseFloat(String(qtyPerCount)) > 0
      ? parseFloat(String(qtyPerCount))
      : 0;

  if (total === 0 || perCount === 0) {
    return [];
  }

  if (!isDivisible(total, perCount)) {
    return [];
  }

  const count = Math.round(total / perCount);
  return Array.from({ length: count }, () => perCount);
}
