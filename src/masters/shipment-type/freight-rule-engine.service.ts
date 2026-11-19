import { Injectable } from '@nestjs/common';

export interface ShipmentTypeRuleInput {
  id?: number;
  code?: string;
  name?: string;
}

export interface FreightRuleEvaluationResult {
  matrixResult: boolean;
  freightRequired: boolean;
  salesIncoterm: string;
  purchaseIncoterm: string;
  reason: string;
}

export const SUPPORTED_INCOTERMS = [
  'EXW',
  'FCA',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
] as const;

export type SupportedIncoterm = (typeof SUPPORTED_INCOTERMS)[number];

/**
 * Freight Compatibility Matrix (Source of Truth)
 *
 * Matrix Structure:
 * Row (1st key)    = Sales Contract Incoterm (SC)
 * Column (2nd key) = Purchase Contract Incoterm (PC)
 * Value            = boolean (true = YES, false = NO)
 *
 * Rules:
 * - Exactly 11 Incoterms supported: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP
 * - Same Incoterms (SC == PC) are NEVER automatically YES -> ALWAYS NO (false)
 *   e.g. FCA -> FCA = NO, CIF -> CIF = NO, DAP -> DAP = NO, DDP -> DDP = NO
 * - Lookups are performed directly against this matrix table.
 */
export const FREIGHT_COMPATIBILITY_MATRIX: Record<
  string,
  Record<string, boolean>
> = {
  EXW: {
    EXW: false, FCA: false, FAS: false, FOB: false, CFR: false, CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  FCA: {
    EXW: true,  FCA: false, FAS: false, FOB: false, CFR: false, CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  FAS: {
    EXW: true,  FCA: true,  FAS: false, FOB: false, CFR: false, CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  FOB: {
    EXW: true,  FCA: true,  FAS: true,  FOB: false, CFR: false, CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  CFR: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: false, CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  CIF: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: false, CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  CPT: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: true,  CPT: false, CIP: false, DAP: false, DPU: false, DDP: false,
  },
  CIP: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: true,  CPT: true,  CIP: false, DAP: false, DPU: false, DDP: false,
  },
  DAP: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: true,  CPT: true,  CIP: true,  DAP: false, DPU: false, DDP: false,
  },
  DPU: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: true,  CPT: true,  CIP: true,  DAP: true,  DPU: false, DDP: false,
  },
  DDP: {
    EXW: true,  FCA: true,  FAS: true,  FOB: true,  CFR: true,  CIF: true,  CPT: true,  CIP: true,  DAP: true,  DPU: true,  DDP: false,
  },
};

/**
 * Extracts and normalizes primary 3-letter Incoterm code from a string or object.
 * Maps legacy or alias codes (e.g. CNF -> CFR, DAT -> DPU).
 */
export function extractIncotermCode(
  st?: ShipmentTypeRuleInput | string | number | null,
): string {
  if (st === undefined || st === null) return '';
  if (typeof st === 'number') return '';

  if (typeof st === 'string') {
    const trimmed = st.trim().toUpperCase();
    const match = trimmed.match(/^([A-Z]{3,4})/);
    let code = match ? match[1] : trimmed;
    if (code === 'CNF') code = 'CFR';
    if (code === 'DAT') code = 'DPU';
    return code;
  }

  if (typeof st === 'object') {
    if (st.code) {
      return extractIncotermCode(st.code);
    }
    if (st.name) {
      return extractIncotermCode(st.name);
    }
  }

  return '';
}

/**
 * Direct lookup in Freight Compatibility Matrix.
 * Row = Sales Contract Incoterm
 * Column = Purchase Contract Incoterm
 */
export function lookupFreightMatrix(
  scIncoterm?: string | null,
  pcIncoterm?: string | null,
): boolean {
  const scCode = extractIncotermCode(scIncoterm);
  const pcCode = extractIncotermCode(pcIncoterm);

  if (!scCode || !pcCode) return false;
  const row = FREIGHT_COMPATIBILITY_MATRIX[scCode];
  if (!row) return false;
  const val = row[pcCode];
  return typeof val === 'boolean' ? val : false;
}

/**
 * Pure evaluation function using the Freight Compatibility Matrix as Source of Truth.
 *
 * Parameters:
 * @param pcShipmentType Purchase Contract Incoterm (Column)
 * @param scShipmentType Sales Contract Incoterm (Row)
 *
 * Matrix Lookup:
 * Row    = SC (Sales Contract)
 * Column = PC (Purchase Contract)
 *
 * Rules:
 * - If Matrix Result is "Yes" (true) -> Freight Required = YES
 * - If Matrix Result is "No" (false)  -> Freight Required = NO
 * - Same Incoterms (SC == PC) are NEVER automatically YES -> always NO
 *   (e.g. FCA -> FCA = NO, CIF -> CIF = NO, DAP -> DAP = NO, DDP -> DDP = NO)
 */
export function evaluateFreightRequired(
  pcShipmentType?: ShipmentTypeRuleInput | string | number | null,
  scShipmentType?: ShipmentTypeRuleInput | string | number | null,
  shipmentId?: number,
): FreightRuleEvaluationResult {
  const scCode = extractIncotermCode(scShipmentType);
  const pcCode = extractIncotermCode(pcShipmentType);
  const matrixResult = lookupFreightMatrix(scCode, pcCode);
  const reason = `Compatibility Matrix: SC ${scCode || 'unknown'} x PC ${pcCode || 'unknown'} = ${matrixResult ? 'YES' : 'NO'}.`;

  if (scCode === 'FCA' && pcCode === 'FCA') {
    console.debug('[FreightCompatibilityMatrix]', {
      shipmentId: shipmentId ?? null,
      salesContractIncoterm: scCode,
      purchaseContractIncoterm: pcCode,
      matrixResult,
      freightRequired: matrixResult,
    });
  }

  return {
    matrixResult,
    freightRequired: matrixResult,
    salesIncoterm: scCode,
    purchaseIncoterm: pcCode,
    reason,
  };
}

@Injectable()
export class FreightRuleEngineService {
  evaluate(
    pcShipmentType?: ShipmentTypeRuleInput | string | number | null,
    scShipmentType?: ShipmentTypeRuleInput | string | number | null,
    shipmentId?: number,
  ): FreightRuleEvaluationResult {
    return evaluateFreightRequired(pcShipmentType, scShipmentType, shipmentId);
  }

  lookup(scIncoterm?: string | null, pcIncoterm?: string | null): boolean | null {
    return lookupFreightMatrix(scIncoterm, pcIncoterm);
  }
}
