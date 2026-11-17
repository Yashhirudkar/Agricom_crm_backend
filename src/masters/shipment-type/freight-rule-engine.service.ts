import { Injectable } from '@nestjs/common';

export interface ShipmentTypeRuleInput {
  id?: number;
  code?: string;
  name?: string;
  stageOrder?: number | null;
  locationType?: string | null;
  freightRequiredAfterStage?: boolean | null;
  purchaseContractDeliveryPlaceRequired?: boolean | null;
  salesContractDeliveryPlaceRequired?: boolean | null;
}

export interface FreightRuleEvaluationResult {
  freightRequired: boolean;
  salesStage: number;
  purchaseStage: number;
  freightRequiredAfterStage: boolean;
  reason: string;
}

/**
 * Pure evaluation function for dynamic freight rule engine.
 *
 * Rules:
 * When a Shipment is created / evaluated, compare Purchase Contract Shipment Type and Sales Contract Shipment Type:
 * - If Sales Stage > Purchase Stage AND Sales freightRequiredAfterStage is Yes (true) => Freight Required = YES
 * - If Sales Stage <= Purchase Stage => Freight Required = NO
 * - If Sales freightRequiredAfterStage is No (false) => Freight Required = NO
 *
 * If no Purchase Contract is linked yet:
 * - If Sales freightRequiredAfterStage is Yes (true) and stageOrder > 0 => Freight Required = YES
 * - Else => Freight Required = NO
 */
export function evaluateFreightRequired(
  pcShipmentType?: ShipmentTypeRuleInput | null,
  scShipmentType?: ShipmentTypeRuleInput | null,
): FreightRuleEvaluationResult {
  const scStage =
    scShipmentType?.stageOrder !== undefined && scShipmentType?.stageOrder !== null
      ? Number(scShipmentType.stageOrder)
      : 0;
  const pcStage =
    pcShipmentType?.stageOrder !== undefined && pcShipmentType?.stageOrder !== null
      ? Number(pcShipmentType.stageOrder)
      : 0;
  const scFreightAfterStage = Boolean(scShipmentType?.freightRequiredAfterStage);

  if (!scShipmentType && !pcShipmentType) {
    return {
      freightRequired: false,
      salesStage: 0,
      purchaseStage: 0,
      freightRequiredAfterStage: false,
      reason: 'Neither Sales nor Purchase shipment type is defined.',
    };
  }

  // When Sales Contract shipment type exists:
  if (scShipmentType) {
    if (pcShipmentType) {
      const isSalesStageGreater = scStage > pcStage;
      const required = isSalesStageGreater && scFreightAfterStage;
      return {
        freightRequired: required,
        salesStage: scStage,
        purchaseStage: pcStage,
        freightRequiredAfterStage: scFreightAfterStage,
        reason: required
          ? `Sales Stage (${scStage}) > Purchase Stage (${pcStage}) and Freight Required After Stage = Yes.`
          : !isSalesStageGreater
            ? `Sales Stage (${scStage}) <= Purchase Stage (${pcStage}). Freight Required = NO.`
            : `Freight Required After Stage is No for Sales Shipment Type (${scShipmentType.code || scShipmentType.name || 'SC'}). Freight Required = NO.`,
      };
    }

    // Standalone Sales Contract without linked Purchase Contract
    const required = scFreightAfterStage && scStage > 0;
    return {
      freightRequired: required,
      salesStage: scStage,
      purchaseStage: 0,
      freightRequiredAfterStage: scFreightAfterStage,
      reason: required
        ? `No linked Purchase Contract. Sales Shipment Type requires freight after Stage ${scStage}. Freight Required = YES.`
        : `Sales Shipment Type does not require freight after Stage ${scStage}. Freight Required = NO.`,
    };
  }

  // Only Purchase Contract exists without Sales Contract
  return {
    freightRequired: false,
    salesStage: 0,
    purchaseStage: pcStage,
    freightRequiredAfterStage: false,
    reason: 'Sales Contract shipment type is not defined. Freight Required = NO.',
  };
}

@Injectable()
export class FreightRuleEngineService {
  evaluate(
    pcShipmentType?: ShipmentTypeRuleInput | null,
    scShipmentType?: ShipmentTypeRuleInput | null,
  ): FreightRuleEvaluationResult {
    return evaluateFreightRequired(pcShipmentType, scShipmentType);
  }
}

