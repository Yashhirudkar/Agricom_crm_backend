/**
 * Utility functions for generating dynamic Quantity descriptions for Sales Contracts
 * following international trade documentation standards.
 */

export interface QuantityDescriptionOptions {
  transportMode?: string | null;
  unitCount?: number | string | null;
  containerType?: string | null;
  qtyPerUnit?: number | string | null;
  totalQuantity?: number | string | null;
  tolerancePercentage?: number | string | null;
}

/**
 * Normalizes transport mode to standard enum keys: 'ROAD', 'SEA', 'BULK', 'RAIL', 'AIR'
 */
export function normalizeTransportMode(mode?: string | null): 'ROAD' | 'SEA' | 'BULK' | 'RAIL' | 'AIR' | 'OTHER' {
  if (!mode) return 'SEA';
  const m = String(mode).trim().toLowerCase();
  if (m.includes('bulk')) return 'BULK';
  if (m.includes('road') || m.includes('truck')) return 'ROAD';
  if (m.includes('sea') || m.includes('ocean') || m.includes('fcl') || m.includes('container') || m.includes('ship')) return 'SEA';
  if (m.includes('rail') || m.includes('wagon')) return 'RAIL';
  if (m.includes('air') || m.includes('flight')) return 'AIR';
  return 'OTHER';
}

/**
 * Normalizes container type (e.g. '40 FT', '20 FT', '40 HC')
 */
export function formatContainerType(containerType?: string | null): string {
  if (!containerType) return '40 FEET';
  const raw = String(containerType).trim().toUpperCase();
  if (raw.includes('20')) return '20 FEET';
  if (raw.includes('40') && (raw.includes('HC') || raw.includes('HIGH'))) return '40 HC FEET';
  if (raw.includes('40')) return '40 FEET';
  return raw;
}

/**
 * Formats a metric tonne quantity according to standard conventions:
 * Whole numbers without decimals (e.g. 22, 44, 104, 5000),
 * Decimal numbers with up to 2 decimal places (e.g. 21.50, 64.50).
 */
export function formatQuantityNumber(val?: number | string | null): string {
  if (val == null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0';
  if (num % 1 === 0) {
    return String(Math.round(num));
  }
  return num.toFixed(2);
}

/**
 * Formats tolerance percentage (default: 5%)
 */
export function formatTolerancePercentage(tol?: number | string | null): string {
  if (tol == null || tol === '') return '5%';
  const num = typeof tol === 'number' ? tol : parseFloat(String(tol));
  if (isNaN(num)) return '5%';
  return num % 1 === 0 ? `${Math.round(num)}%` : `${num.toFixed(2)}%`;
}

/**
 * Generates human-readable, international trade standard Quantity text.
 *
 * Examples:
 * - Road:
 *   "2 TRUCKS OF 22 MT EACH,\nTOTAL ABOUT 44 MT +/- 5%"
 *   "3 TRUCKS OF APPROX. 21.50 MT EACH,\nTOTAL ABOUT 64.50 MT +/- 5%"
 * - Sea:
 *   "4 FCL (40 FT) OF APPROX. 26 MT EACH,\nTOTAL ABOUT 104 MT +/- 5%"
 *   "2 FCL (20 FT) OF APPROX. 24 MT EACH,\nTOTAL ABOUT 48 MT +/- 5%"
 * - Bulk:
 *   "TOTAL ABOUT 5000 MT +/- 5%\nIN BULK"
 */
export function generateQuantityDescription(options: QuantityDescriptionOptions): string {
  const totalQty = typeof options.totalQuantity === 'number'
    ? options.totalQuantity
    : parseFloat(String(options.totalQuantity ?? 0)) || 0;

  const qtyPerUnit = typeof options.qtyPerUnit === 'number'
    ? options.qtyPerUnit
    : parseFloat(String(options.qtyPerUnit ?? 0)) || 0;

  let unitCount = options.unitCount != null && options.unitCount !== ''
    ? (typeof options.unitCount === 'number' ? options.unitCount : parseFloat(String(options.unitCount)) || 0)
    : 0;

  // Auto-calculate unitCount if not provided but total and per-unit exist
  if (!unitCount && totalQty > 0 && qtyPerUnit > 0) {
    unitCount = Math.round(totalQty / qtyPerUnit);
  }

  const mode = normalizeTransportMode(options.transportMode);
  const totalStr = formatQuantityNumber(totalQty);
  const tolStr = formatTolerancePercentage(options.tolerancePercentage);

  // 1. Bulk Vessel
  if (mode === 'BULK') {
    return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr} IN BULK`;
  }

  const unitQtyStr = formatQuantityNumber(qtyPerUnit);

  // 2. Road Transport
  if (mode === 'ROAD') {
    if (unitCount > 0 && qtyPerUnit > 0) {
      const truckLabel = unitCount === 1 ? 'TRUCK' : 'TRUCKS';
      return `${unitCount} ${truckLabel} OF ${unitQtyStr} MT EACH, TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
    }
    return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
  }

  // 3. Sea Shipment (FCL)
  if (mode === 'SEA') {
    const contType = formatContainerType(options.containerType);
    if (unitCount > 0 && qtyPerUnit > 0) {
      return `${unitCount} FCL OF ${contType}, ${unitQtyStr} MT EACH, TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
    }
    return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
  }

  // 4. Rail Freight / Wagon
  if (mode === 'RAIL') {
    if (unitCount > 0 && qtyPerUnit > 0) {
      const wagonLabel = unitCount === 1 ? 'WAGON' : 'WAGONS';
      return `${unitCount} ${wagonLabel} OF ${unitQtyStr} MT EACH, TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
    }
    return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
  }

  // 5. Air Freight
  if (mode === 'AIR') {
    if (unitCount > 0 && qtyPerUnit > 0) {
      const airLabel = unitCount === 1 ? 'AIR SHIPMENT' : 'AIR SHIPMENTS';
      return `${unitCount} ${airLabel} OF ${unitQtyStr} MT EACH, TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
    }
    return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
  }

  // Fallback
  if (unitCount > 0 && qtyPerUnit > 0) {
    const unitLabel = unitCount === 1 ? 'UNIT' : 'UNITS';
    return `${unitCount} ${unitLabel} OF ${unitQtyStr} MT EACH, TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
  }

  return `TOTAL ABOUT ${totalStr} MT +/- ${tolStr}`;
}

/**
 * Automatically calculates the Quantity description for a contract item
 * from the contract's Shipment Schedule and Product Item data,
 * strictly without requiring manual input or extra fields.
 */
export function getContractItemQuantityDescription(contract: any = {}, item: any = {}): string {
  const mode = normalizeTransportMode(
    contract.originTransportMode ||
    contract.destinationTransportMode ||
    contract.transportMode ||
    item.transportMode ||
    'SEA',
  );

  const totalQuantity =
    parseFloat(item.quantity) ||
    (contract.shipments || []).reduce((sum: number, s: any) => sum + (parseFloat(s.quantity) || 0), 0) ||
    parseFloat(contract.totalQuantity) ||
    0;

  const shipments = contract.shipments || [];
  const shipmentCount = shipments.length;
  const totalContainers = shipments.reduce(
    (sum: number, s: any) => sum + (parseInt(s.noOfContainers, 10) || 0),
    0,
  );
  const firstShipmentQty = parseFloat(shipments[0]?.quantity) || 0;
  const itemQtyPerCount = parseFloat(item.qtyPerCount) || 0;

  let unitCount = 0;
  let qtyPerUnit = 0;

  if (mode === 'ROAD') {
    // ROAD TRANSPORT:
    // Number of Shipments = Number of Trucks
    // Qty (MT) = Quantity per Truck
    if (shipmentCount > 0) {
      unitCount = totalContainers > shipmentCount ? totalContainers : shipmentCount;
      qtyPerUnit = firstShipmentQty > 0 ? firstShipmentQty : (itemQtyPerCount > 0 ? itemQtyPerCount : (totalQuantity / unitCount));
    } else if (totalQuantity > 0 && itemQtyPerCount > 0) {
      unitCount = Math.round(totalQuantity / itemQtyPerCount);
      qtyPerUnit = itemQtyPerCount;
    } else {
      unitCount = parseInt(item.unitCount, 10) || 1;
      qtyPerUnit = itemQtyPerCount > 0 ? itemQtyPerCount : totalQuantity;
    }
  } else if (mode === 'SEA') {
    // SEA (FCL):
    // Container count from Shipment Schedule, Container Type, Qty Per Shipment
    if (shipmentCount > 0) {
      unitCount = totalContainers > 0 ? totalContainers : shipmentCount;
      qtyPerUnit = firstShipmentQty > 0 ? firstShipmentQty : (itemQtyPerCount > 0 ? itemQtyPerCount : (totalQuantity / unitCount));
    } else if (totalQuantity > 0 && itemQtyPerCount > 0) {
      unitCount = Math.round(totalQuantity / itemQtyPerCount);
      qtyPerUnit = itemQtyPerCount;
    } else {
      unitCount = parseInt(item.unitCount, 10) || 1;
      qtyPerUnit = itemQtyPerCount > 0 ? itemQtyPerCount : totalQuantity;
    }
  } else if (mode === 'BULK') {
    unitCount = shipmentCount > 0 ? shipmentCount : 1;
    qtyPerUnit = totalQuantity;
  } else {
    // Rail / Air / Other
    if (shipmentCount > 0) {
      unitCount = totalContainers > 0 ? totalContainers : shipmentCount;
      qtyPerUnit = firstShipmentQty > 0 ? firstShipmentQty : (itemQtyPerCount > 0 ? itemQtyPerCount : (totalQuantity / unitCount));
    } else if (totalQuantity > 0 && itemQtyPerCount > 0) {
      unitCount = Math.round(totalQuantity / itemQtyPerCount);
      qtyPerUnit = itemQtyPerCount;
    } else {
      unitCount = parseInt(item.unitCount, 10) || 1;
      qtyPerUnit = itemQtyPerCount > 0 ? itemQtyPerCount : totalQuantity;
    }
  }

  // Container Type (only for Sea)
  let containerType = item.containerType || contract.containerType;
  if (!containerType) {
    const p = item.product || {};
    const pCont = p.containerType || p.containerSize;
    if (pCont) {
      containerType = pCont;
    } else if (p.qty20ftContainer && Math.abs(qtyPerUnit - parseFloat(p.qty20ftContainer)) < 0.5) {
      containerType = '20 FEET';
    } else if (p.qty40ftContainer && Math.abs(qtyPerUnit - parseFloat(p.qty40ftContainer)) < 0.5) {
      containerType = '40 FEET';
    } else {
      containerType = '40 FEET';
    }
  }

  const tolerancePercentage =
    item.tolerancePercentage !== undefined && item.tolerancePercentage !== null
      ? item.tolerancePercentage
      : (contract.tolerancePercentage ?? 5);

  return generateQuantityDescription({
    transportMode: mode,
    unitCount,
    containerType,
    qtyPerUnit,
    totalQuantity,
    tolerancePercentage,
  });
}

