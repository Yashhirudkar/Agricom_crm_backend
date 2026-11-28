export type MultiExecutionModeCategory =
  | 'truck'
  | 'rail'
  | 'sea'
  | 'air'
  | 'bulk'
  | 'courier'
  | 'other';

export interface MultiShipmentWeightAllocation {
  shipmentId: number;
  shipmentReference: string;
  quantity: number;
  actualLoadingWeight: number;
  grossWeight: number;
  netWeight: number;
}

/**
 * Parses requested shipmentIds ONLY when >1 distinct valid IDs are provided
 * and include the anchor primary shipmentId. Otherwise returns [].
 */
export function parseMultiExecutionShipmentIds(
  rawIds: unknown,
  primaryShipmentId: number,
): number[] {
  const anchorId = Number(primaryShipmentId);
  if (!Number.isSafeInteger(anchorId) || anchorId <= 0) return [];

  let items: unknown[] = [];
  if (Array.isArray(rawIds)) {
    items = rawIds;
  } else if (typeof rawIds === 'string' && rawIds.trim() !== '') {
    items = rawIds.split(',').map((part) => part.trim());
  } else {
    return [];
  }

  const parsed = Array.from(
    new Set(
      items
        .map((v) => Number(v))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  );

  if (parsed.length <= 1 || !parsed.includes(anchorId)) {
    return [];
  }

  return [anchorId, ...parsed.filter((id) => id !== anchorId)];
}

/**
 * Resolves transport category for multi-shipment stuffing execution across all
 * supported transport modes (Truck/Road, Rail/Wagon, Sea/Container, Bulk, Air, Courier, etc.).
 */
export function getMultiExecutionTransportCategory(
  salesContract?: {
    originTransportMode?: string | null;
    transportMode?: string | null;
  } | null,
): MultiExecutionModeCategory | null {
  const rawMode = String(
    salesContract?.originTransportMode ?? salesContract?.transportMode ?? '',
  )
    .trim()
    .toLowerCase();

  if (!rawMode) return 'sea';

  if (rawMode.includes('rail') || rawMode.includes('wagon')) {
    return 'rail';
  }

  if (
    rawMode === 'road' ||
    rawMode === 'truck' ||
    rawMode.includes('road') ||
    rawMode.includes('truck')
  ) {
    return 'truck';
  }

  if (rawMode.includes('air')) {
    return 'air';
  }

  if (rawMode.includes('bulk')) {
    return 'bulk';
  }

  if (rawMode.includes('courier')) {
    return 'courier';
  }

  if (
    rawMode.includes('sea') ||
    rawMode.includes('ocean') ||
    rawMode.includes('container') ||
    rawMode.includes('fcl') ||
    rawMode.includes('vessel') ||
    rawMode.includes('ship')
  ) {
    return 'sea';
  }

  return 'other';
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function distributeMetricProportionally(
  totalValue: number,
  shipments: Array<{ id: number; quantity: number }>,
  decimals: number,
  capByQuantity: boolean = false,
): Map<number, number> {
  const result = new Map<number, number>();
  if (shipments.length === 0) return result;

  const cleanTotal = Math.max(0, roundToDecimals(Number(totalValue || 0), decimals));
  const totalQty = shipments.reduce(
    (sum, s) => sum + Math.max(0, Number(s.quantity || 0)),
    0,
  );

  let remaining = cleanTotal;
  for (let i = 0; i < shipments.length; i++) {
    const s = shipments[i];
    const maxCap = capByQuantity ? Math.max(0, Number(s.quantity || 0)) : Number.POSITIVE_INFINITY;

    let share: number;
    if (i === shipments.length - 1) {
      share = Math.min(maxCap, Math.max(0, roundToDecimals(remaining, decimals)));
    } else {
      const weight =
        totalQty > 0 ? Math.max(0, Number(s.quantity || 0)) / totalQty : 1 / shipments.length;
      share = Math.min(maxCap, Math.max(0, roundToDecimals(cleanTotal * weight, decimals)));
      remaining = roundToDecimals(remaining - share, decimals);
    }

    result.set(Number(s.id), share);
  }

  // If last row hit capByQuantity leaving unallocated remainder, spill into headroom of earlier rows
  let allocatedTotal = Array.from(result.values()).reduce((sum, v) => sum + v, 0);
  let unallocated = roundToDecimals(cleanTotal - allocatedTotal, decimals);
  if (capByQuantity && unallocated > 0) {
    for (const s of shipments) {
      if (unallocated <= 0) break;
      const current = result.get(Number(s.id)) || 0;
      const headroom = roundToDecimals(Math.max(0, Number(s.quantity || 0) - current), decimals);
      if (headroom > 0) {
        const delta = Math.min(headroom, unallocated);
        result.set(Number(s.id), roundToDecimals(current + delta, decimals));
        unallocated = roundToDecimals(unallocated - delta, decimals);
      }
    }
  }

  return result;
}

/**
 * Distributes shared combined weights across selected shipments proportionally
 * by each shipment's contracted quantity so sums match exact entered totals.
 */
export function distributeMultiShipmentWeights(
  totalActualLoadingWeight: number,
  totalGrossWeight: number,
  totalNetWeight: number,
  shipments: Array<{
    id: number;
    shipmentReference?: string | null;
    quantity?: number | string | null;
  }>,
): MultiShipmentWeightAllocation[] {
  const normalizedShipments = shipments.map((s) => ({
    id: Number(s.id),
    shipmentReference: String(s.shipmentReference || `SHP-${s.id}`),
    quantity: Math.max(0, Number(s.quantity || 0)),
  }));

  const actualMap = distributeMetricProportionally(
    totalActualLoadingWeight,
    normalizedShipments,
    2,
    true,
  );
  const grossMap = distributeMetricProportionally(
    totalGrossWeight,
    normalizedShipments,
    3,
    false,
  );
  const netMap = distributeMetricProportionally(
    totalNetWeight,
    normalizedShipments,
    3,
    false,
  );

  return normalizedShipments.map((s) => ({
    shipmentId: s.id,
    shipmentReference: s.shipmentReference,
    quantity: s.quantity,
    actualLoadingWeight: actualMap.get(s.id) ?? 0,
    grossWeight: grossMap.get(s.id) ?? 0,
    netWeight: netMap.get(s.id) ?? 0,
  }));
}
