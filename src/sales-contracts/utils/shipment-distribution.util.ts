/**
 * Centralized utility to distribute a total product quantity evenly across a specified number of shipments.
 * Handles decimals cleanly (up to 2 decimal places), and places any remainder in the
 * final shipment row so that the sum of all shipment quantities strictly equals totalProductQty.
 *
 * @param totalProductQty - Total quantity from product items in MT
 * @param numShipments - Number of shipments to divide across (>= 1)
 * @returns Array of shipment quantities
 */
export function distributeShipmentQuantities(
  totalProductQty: number | string,
  numShipments: number | string,
): number[] {
  const count = Math.max(1, parseInt(String(numShipments), 10) || 1);
  const total = Math.max(0, parseFloat(String(totalProductQty)) || 0);

  if (total === 0) {
    return Array.from({ length: count }, () => 0);
  }

  // Round raw division to 2 decimal places
  const rawPerShipment = total / count;
  const baseQty = Math.round(rawPerShipment * 100) / 100;
  const quantities: number[] = [];
  let allocated = 0;

  for (let i = 0; i < count - 1; i++) {
    quantities.push(baseQty);
    allocated = Math.round((allocated + baseQty) * 100) / 100;
  }

  // The last shipment receives the exact remainder to ensure sum === total
  const remainder = Math.round((total - allocated) * 100) / 100;
  quantities.push(remainder);

  return quantities;
}
