import { evaluateFreightRequired } from '../freight-rule-engine.service';

export function isFreightRequiredForIncoterm(
  salesIncoterm?: string | null,
  purchaseIncoterm?: string | null,
): boolean {
  return evaluateFreightRequired(purchaseIncoterm, salesIncoterm)
    .freightRequired;
}
