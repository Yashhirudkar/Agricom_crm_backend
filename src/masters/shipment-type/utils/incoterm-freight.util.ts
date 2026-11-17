/**
 * Freight Required Logic by Incoterm
 *
 * Rules:
 * - EXW, FCA, FAS, FOB => FreightRequired = false
 * - CFR, CNF, CIF, CPT, CIP, DAP, DPU, DDP => FreightRequired = true
 */
export const NO_FREIGHT_INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB'] as const;
export const FREIGHT_REQUIRED_INCOTERMS = [
  'CFR',
  'CNF',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
] as const;

export function extractIncotermCode(incoterm?: string | null): string {
  if (!incoterm || typeof incoterm !== 'string') return '';
  const trimmed = incoterm.trim().toUpperCase();
  // Extract primary code token, e.g. "CFR (CNF)" -> "CFR", "FOB - Free on Board" -> "FOB"
  const match = trimmed.match(/^([A-Z]{3,4})/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

export function isFreightRequiredForIncoterm(incoterm?: string | null): boolean {
  if (!incoterm || typeof incoterm !== 'string') return false;
  const upper = incoterm.trim().toUpperCase();

  const code = extractIncotermCode(upper);

  if ((NO_FREIGHT_INCOTERMS as readonly string[]).includes(code)) {
    return false;
  }

  if (
    (FREIGHT_REQUIRED_INCOTERMS as readonly string[]).includes(code) ||
    upper.includes('CNF') ||
    upper.startsWith('CFR') ||
    upper.startsWith('CIF') ||
    upper.startsWith('CPT') ||
    upper.startsWith('CIP') ||
    upper.startsWith('DAP') ||
    upper.startsWith('DPU') ||
    upper.startsWith('DDP')
  ) {
    return true;
  }

  return false;
}
