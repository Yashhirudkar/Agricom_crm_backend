import { CreateFreightQuoteDto } from '../dto/create-freight-quote.dto';

export const SHIPMENTS_MANAGEMENT_SYNC_SOURCE = 'shipments_management';

export interface PreUpdateQuoteChargeSnapshot {
  chargeMasterId: number | null;
  chargeName: string;
  amount: number;
  displayOrder: number;
}

export interface PreUpdateQuoteSnapshot {
  id: number;
  sellerId: number | null;
  quoteDate: string | null;
  freightAmount: number;
  currency: string;
  wagonType: string;
  wagonCapacity: string;
  vehicleType: string;
  carrierReferenceNo: string;
  transitDays: number | null;
  validityDate: string | null;
  remarks: string;
  paymentTermId: number | null;
  version: number;
  chargeSignatures: PreUpdateQuoteChargeSnapshot[];
}

export interface RailFreightSyncSummary {
  workflowSource: string;
  totalSelectedCount: number;
  appliedCount: number;
  syncedShipmentIds: number[];
  skippedShipmentIds: number[];
  failedShipments: Array<{ shipmentId: number; message: string }>;
  failedCount: number;
}

/**
 * Checks strictly whether a parent Sales Contract specifies Rail Freight / Wagon
 * as its Origin Transport Mode. Never falls back to destinationTransportMode or other modes.
 */
export function isRailOriginTransportMode(
  salesContract?: { originTransportMode?: string | null } | null,
): boolean {
  const mode = String(salesContract?.originTransportMode ?? '')
    .trim()
    .toLowerCase();
  if (!mode) return false;
  return mode === 'rail' || mode.includes('rail') || mode.includes('wagon');
}

/**
 * Returns deduplicated positive integer sibling shipment IDs only when:
 * - sync was initiated from Shipments Management Freight Allocation
 * - multiple valid shipment IDs were selected together (> 1)
 * Excludes the source shipment ID itself so only destination siblings remain.
 */
export function extractUniqueSiblingShipmentIds(
  syncShipmentIds: unknown,
  sourceShipmentId: unknown,
): number[] {
  const sourceId = Number(sourceShipmentId);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return [];
  if (!Array.isArray(syncShipmentIds)) return [];

  const uniqueSelected = Array.from(
    new Set(
      syncShipmentIds
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  );

  if (uniqueSelected.length <= 1) return [];
  if (!uniqueSelected.includes(sourceId)) return [];

  return uniqueSelected.filter((id) => id !== sourceId);
}

/**
 * Strips sync orchestration control keys from DTO before passing directly into
 * Sequelize create/update for the primary quote.
 */
export function stripRailSyncControlFields<T extends Record<string, any>>(
  dto: T,
): Omit<T, 'syncWorkflowSource' | 'syncShipmentIds'> {
  const { syncWorkflowSource: _sws, syncShipmentIds: _ssids, ...cleanDto } =
    (dto || {}) as any;
  return cleanDto;
}

export function normalizeDateOnlyString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }
  const str = String(value).trim();
  if (!str) return null;
  return str.includes('T') ? str.split('T')[0] : str.slice(0, 10);
}

/**
 * Builds an explicit allowlisted business-data payload for a sibling FreightQuote
 * record. Never copies PKs, UUIDs, quoteNumber, shipmentId, audit fields, or dates.
 */
export function buildSiblingFreightQuotePayload(params: {
  dto: CreateFreightQuoteDto;
  calculatedFreightAmount: number;
  resolvedPaymentTerm: {
    paymentTermId: number | null;
    paymentTerms: string | null;
  };
  sourceQuote?: any;
  isUpdate: boolean;
  userId?: number;
  companyId?: number | null;
  destShipment?: any;
  destLogisticsId?: number;
  destPurchaseContractId?: number | null;
  quoteNumber?: string;
  newVersion?: number;
}): Record<string, any> {
  const {
    dto,
    calculatedFreightAmount,
    resolvedPaymentTerm,
    sourceQuote,
    isUpdate,
    userId,
    companyId,
    destShipment,
    destLogisticsId,
    destPurchaseContractId,
    quoteNumber,
    newVersion,
  } = params;

  const businessFields: Record<string, any> = {
    origin: dto.origin || dto.loadingPoint || sourceQuote?.origin || null,
    destination: dto.destination ?? sourceQuote?.destination ?? null,
    productId: dto.productId ?? sourceQuote?.productId ?? null,
    quoteDate: dto.quoteDate,
    sellerId: dto.sellerId ?? null,
    carrierReferenceNo: dto.carrierReferenceNo ?? null,
    vehicleType: dto.vehicleType ?? null,
    containerType: dto.containerType ?? null,
    truckType: dto.truckType ?? null,
    truckCapacity: dto.truckCapacity ?? null,
    wagonType: dto.wagonType ?? null,
    wagonCapacity: dto.wagonCapacity ?? null,
    shippingLine: dto.shippingLine ?? null,
    contactPerson: dto.contactPerson ?? null,
    contactNumber: dto.contactNumber ?? null,
    freightAmount: calculatedFreightAmount,
    currency: dto.currency ?? sourceQuote?.currency ?? 'INR',
    fuelCharges: dto.fuelCharges ?? 0,
    additionalCharges: dto.additionalCharges ?? 0,
    transitDays: dto.transitDays ?? null,
    validityDate: dto.validityDate ?? null,
    paymentTermId: resolvedPaymentTerm.paymentTermId ?? null,
    paymentTerms: resolvedPaymentTerm.paymentTerms ?? null,
    remarks: dto.remarks ?? null,
    pol: dto.pol ?? null,
    pod: dto.pod ?? null,
    etd: dto.etd ?? null,
    eta: dto.eta ?? null,
    freeDays: dto.freeDays ?? null,
    cutoffDate: dto.cutoffDate ?? null,
    vessel: dto.vessel ?? null,
    voyage: dto.voyage ?? null,
    containerSize: dto.containerSize ?? null,
    routeId: dto.routeId || null,
  };

  if (isUpdate) {
    return {
      ...businessFields,
      version: newVersion ?? 2,
      updatedBy: userId ?? null,
    };
  }

  return {
    ...businessFields,
    ...(companyId != null ? { companyId } : {}),
    quoteNumber,
    logisticsId: destLogisticsId ?? null,
    shipmentId: destShipment?.id ?? null,
    purchaseContractId: destPurchaseContractId ?? null,
    businessTransactionId: destShipment?.businessTransactionId ?? null,
    isDirect: false,
    isPreferred: false,
    isRejected: false,
    version: 1,
    createdBy: userId ?? null,
    shipmentSequence:
      destShipment?.shipmentSequence ?? destShipment?.shipmentNo ?? null,
  };
}

function normalizeChargesForSnapshot(charges: any[]): PreUpdateQuoteChargeSnapshot[] {
  if (!Array.isArray(charges)) return [];
  return charges
    .map((c, idx) => ({
      chargeMasterId:
        c?.chargeMasterId != null ? Number(c.chargeMasterId) : null,
      chargeName: String(c?.chargeName ?? '').trim().toLowerCase(),
      amount: Number(c?.amount ?? 0),
      displayOrder: Number(c?.displayOrder ?? idx + 1),
    }))
    .sort((a, b) =>
      a.displayOrder !== b.displayOrder
        ? a.displayOrder - b.displayOrder
        : a.chargeName.localeCompare(b.chargeName),
    );
}

/**
 * Captures pre-edit source quote values before updating the source quote,
 * allowing deterministic matching of the twin quote on each sibling Rail shipment.
 */
export function capturePreUpdateQuoteSnapshot(
  quote: any,
  existingCharges: any[] = [],
): PreUpdateQuoteSnapshot {
  return {
    id: Number(quote?.id),
    sellerId: quote?.sellerId != null ? Number(quote.sellerId) : null,
    quoteDate: normalizeDateOnlyString(quote?.quoteDate),
    freightAmount: Number(quote?.freightAmount ?? 0),
    currency: String(quote?.currency ?? '').trim().toUpperCase(),
    wagonType: String(quote?.wagonType ?? '').trim().toLowerCase(),
    wagonCapacity: String(quote?.wagonCapacity ?? '').trim().toLowerCase(),
    vehicleType: String(quote?.vehicleType ?? '').trim().toLowerCase(),
    carrierReferenceNo: String(quote?.carrierReferenceNo ?? '').trim().toLowerCase(),
    transitDays: quote?.transitDays != null ? Number(quote.transitDays) : null,
    validityDate: normalizeDateOnlyString(quote?.validityDate),
    remarks: String(quote?.remarks ?? '').trim().toLowerCase(),
    paymentTermId:
      quote?.paymentTermId != null ? Number(quote.paymentTermId) : null,
    version: Number(quote?.version ?? 1),
    chargeSignatures: normalizeChargesForSnapshot(
      existingCharges.length > 0 ? existingCharges : quote?.charges || [],
    ),
  };
}

function doChargeSignaturesMatch(
  a: PreUpdateQuoteChargeSnapshot[],
  b: PreUpdateQuoteChargeSnapshot[],
): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return a.every(
    (item, idx) =>
      item.chargeName === b[idx].chargeName &&
      Math.abs(item.amount - b[idx].amount) < 0.01,
  );
}

/**
 * Finds the best matching non-rejected sibling quote corresponding to the
 * pre-update source quote. Requires seller identity match and sufficient
 * business-attribute overlap so unrelated quotes are never overwritten.
 */
export function findMatchingSiblingQuote(
  candidateQuotes: any[],
  snapshot: PreUpdateQuoteSnapshot,
): any | null {
  if (!Array.isArray(candidateQuotes) || candidateQuotes.length === 0) {
    return null;
  }

  const activeCandidates = candidateQuotes.filter(
    (q) => q && !q.isRejected && Number(q.id) !== snapshot.id,
  );
  if (activeCandidates.length === 0) return null;

  const sameSellerCandidates = activeCandidates.filter((q) => {
    const qSellerId = q.sellerId != null ? Number(q.sellerId) : null;
    if (snapshot.sellerId != null) {
      return qSellerId === snapshot.sellerId;
    }
    return qSellerId == null;
  });

  if (sameSellerCandidates.length === 0) return null;

  let bestQuote: any = null;
  let bestScore = -1;
  let bestVersionMatch = false;

  for (const candidate of sameSellerCandidates) {
    let score = 0;

    if (normalizeDateOnlyString(candidate.quoteDate) === snapshot.quoteDate) {
      score += 20;
    }
    if (
      Math.abs(Number(candidate.freightAmount ?? 0) - snapshot.freightAmount) <
      0.01
    ) {
      score += 25;
    }
    if (
      String(candidate.currency ?? '').trim().toUpperCase() ===
      snapshot.currency
    ) {
      score += 10;
    }
    if (
      snapshot.wagonType &&
      String(candidate.wagonType ?? '').trim().toLowerCase() ===
        snapshot.wagonType
    ) {
      score += 15;
    }
    if (
      snapshot.wagonCapacity &&
      String(candidate.wagonCapacity ?? '').trim().toLowerCase() ===
        snapshot.wagonCapacity
    ) {
      score += 15;
    }
    if (
      snapshot.transitDays != null &&
      Number(candidate.transitDays ?? -1) === snapshot.transitDays
    ) {
      score += 10;
    }
    if (
      snapshot.validityDate &&
      normalizeDateOnlyString(candidate.validityDate) === snapshot.validityDate
    ) {
      score += 10;
    }
    if (
      snapshot.carrierReferenceNo &&
      String(candidate.carrierReferenceNo ?? '').trim().toLowerCase() ===
        snapshot.carrierReferenceNo
    ) {
      score += 10;
    }
    if (
      snapshot.remarks &&
      String(candidate.remarks ?? '').trim().toLowerCase() === snapshot.remarks
    ) {
      score += 5;
    }
    if (
      snapshot.paymentTermId != null &&
      Number(candidate.paymentTermId ?? 0) === snapshot.paymentTermId
    ) {
      score += 5;
    }

    const candidateCharges = normalizeChargesForSnapshot(candidate.charges || []);
    if (doChargeSignaturesMatch(candidateCharges, snapshot.chargeSignatures)) {
      score += 25;
    }

    const versionMatches = Number(candidate.version ?? 1) === snapshot.version;
    if (versionMatches) {
      score += 10;
    }

    if (
      score > bestScore ||
      (score === bestScore && versionMatches && !bestVersionMatch)
    ) {
      bestScore = score;
      bestVersionMatch = versionMatches;
      bestQuote = candidate;
    }
  }

  if (bestScore >= 55) return bestQuote;
  if (sameSellerCandidates.length === 1 && bestScore >= 20) return bestQuote;
  return null;
}
