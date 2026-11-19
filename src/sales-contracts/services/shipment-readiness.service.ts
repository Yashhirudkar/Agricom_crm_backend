import { Injectable, Optional } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Sequelize as SequelizeConnection } from 'sequelize';
import { CargoShipmentAllocation } from '../../cargo-availability/models/cargo-shipment-allocation.model';
import { CargoLoading } from '../../cargo-availability/models/cargo-loading.model';
import { Logistics } from '../../logistics/models/logistics.model';
import { FreightQuote } from '../../logistics/models/freight-quote.model';
import { evaluateFreightRequired } from '../../masters/shipment-type/freight-rule-engine.service';
import { isTransportAllocationComplete } from '../../logistics/utils/transport-allocation.util';

interface ShipmentFreightRuleRow {
  shipment_id?: number | string;
  shipmentId?: number | string;
  sc_st_id?: number | string | null;
  sc_st_code?: string | null;
  sc_st_delivery_required?: boolean | null;
  pc_id?: number | string | null;
  pc_st_id?: number | string | null;
  pc_st_code?: string | null;
  pc_st_delivery_required?: boolean | null;
}

export interface ShipmentReadinessResult {
  cargoReady: boolean;
  freightReady: boolean;
  freightRequired: boolean;
  freightRuleReason: string | null;
  isFreightNotApplicable: boolean;
  freightAllocationStatus: 'Yes' | 'No';
  systemReady: boolean;
  manualReadyOverride: boolean | null;
  manualReadyBy: number | null;
  manualReadyByUser: { id: number; name: string } | null;
  manualReadyAt: Date | string | null;
  manualReadyReason: string | null;
  readyForShipment: boolean; // Final Ready Status
  isManualOverride: boolean;
  readySource: 'System' | 'Manual';
  // Extensible for future readiness gates (e.g. Documents, QA, Inspection)
  documentsReady?: boolean;
  qaReady?: boolean;
  inspectionReady?: boolean;
  reasons: string[];
}

@Injectable()
export class ShipmentReadinessService {
  constructor(
    @InjectModel(CargoShipmentAllocation)
    private readonly cargoAllocationModel: typeof CargoShipmentAllocation,
    @InjectModel(CargoLoading)
    private readonly cargoLoadingModel: typeof CargoLoading,
    @InjectModel(Logistics)
    private readonly logisticsModel: typeof Logistics,
    @InjectModel(FreightQuote)
    private readonly freightQuoteModel: typeof FreightQuote,
    @Optional()
    @InjectConnection()
    private readonly sequelize?: SequelizeConnection,
  ) {}

  /**
   * Evaluates readiness for a batch of shipments to avoid N+1 queries.
   * A shipment is ready for execution when Cargo Allocation is completed
   * and Freight Allocation is completed (or automatically set to Yes).
   */
  async evaluateBatch(
    shipments: any[],
  ): Promise<Map<number, ShipmentReadinessResult>> {
    const resultMap = new Map<number, ShipmentReadinessResult>();
    if (!shipments || shipments.length === 0) {
      return resultMap;
    }

    const shipmentIds = shipments.map((s) => s.id).filter(Boolean);
    const logisticsIds = Array.from(
      new Set(
        shipments
          .map((s) => s.logisticsId)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    );
    const businessTxIds = Array.from(
      new Set(
        shipments
          .flatMap((s) => [
            s.businessTransactionId,
            s.salesContract?.businessTransactionId,
          ])
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    );
    const purchaseContractIdsByShipment = new Map<number, Set<number>>();
    for (const shipment of shipments) {
      const purchaseContractId =
        shipment.purchaseContractId ?? shipment.purchaseContract?.id;
      if (purchaseContractId) {
        purchaseContractIdsByShipment.set(
          shipment.id,
          new Set([Number(purchaseContractId)]),
        );
      }
    }

    const freightRulesByShipment = new Map<
      number,
      ReturnType<typeof evaluateFreightRequired>
    >();
    if (this.sequelize && shipmentIds.length > 0) {
      const ruleRows = await this.sequelize.query<ShipmentFreightRuleRow>(
        `SELECT
           scs.id AS shipment_id,
           sc_st.id AS sc_st_id,
           sc_st.code AS sc_st_code,
           sc_st.purchase_contract_delivery_place_required AS sc_st_delivery_required,
           pc.id AS pc_id,
           pc_st.id AS pc_st_id,
           pc_st.code AS pc_st_code,
           pc_st.purchase_contract_delivery_place_required AS pc_st_delivery_required
         FROM sales_contract_shipments scs
         LEFT JOIN sales_contracts sc ON sc.id = scs.sales_contract_id
         LEFT JOIN shipment_types sc_st ON sc_st.id = sc.shipment_type_id
         LEFT JOIN LATERAL (
           SELECT pc.id, pc.shipment_type_id
           FROM purchase_contracts pc
           LEFT JOIN purchase_contract_shipments pcs
             ON pcs.purchase_contract_id = pc.id
           WHERE pcs.shipment_id = scs.id
              OR pc.sales_contract_id = scs.sales_contract_id
              OR pc.business_transaction_id = COALESCE(
                scs.business_transaction_id,
                sc.business_transaction_id
              )
           ORDER BY
             CASE
               WHEN pcs.shipment_id = scs.id THEN 0
               WHEN pc.sales_contract_id = scs.sales_contract_id THEN 1
               ELSE 2
             END,
             pc.updated_at DESC,
             pc.id DESC
           LIMIT 1
         ) pc ON true
         LEFT JOIN shipment_types pc_st ON pc_st.id = pc.shipment_type_id
         WHERE scs.id IN (:shipmentIds)`,
        { replacements: { shipmentIds }, type: QueryTypes.SELECT },
      );

      for (const row of ruleRows) {
        const shipmentId = Number(row.shipment_id || row.shipmentId);
        if (!shipmentId) continue;

        const salesShipmentType = row.sc_st_id
          ? {
              id: Number(row.sc_st_id),
              code: row.sc_st_code ?? undefined,
              purchaseContractDeliveryPlaceRequired:
                row.sc_st_delivery_required,
            }
          : null;
        const purchaseShipmentType = row.pc_st_id
          ? {
              id: Number(row.pc_st_id),
              code: row.pc_st_code ?? undefined,
              purchaseContractDeliveryPlaceRequired:
                row.pc_st_delivery_required,
            }
          : null;

        freightRulesByShipment.set(
          shipmentId,
          evaluateFreightRequired(
            purchaseShipmentType,
            salesShipmentType,
            shipmentId,
          ),
        );
        const purchaseContractId = Number(row.pc_id);
        if (purchaseContractId) {
          const ids =
            purchaseContractIdsByShipment.get(shipmentId) ?? new Set<number>();
          ids.add(purchaseContractId);
          purchaseContractIdsByShipment.set(shipmentId, ids);
        }
      }
    }

    // Batch fetch allocations and logistics records for the linked contracts.
    const [allocations, loadings, logisticsRecords] = await Promise.all([
      this.cargoAllocationModel.findAll({
        where: {
          shipmentId: { [Op.in]: shipmentIds },
          status: 'Active',
        },
        attributes: ['id', 'shipmentId', 'allocatedQty', 'status'],
      }),
      this.cargoLoadingModel.findAll({
        where: {
          shipmentId: { [Op.in]: shipmentIds },
          status: { [Op.ne]: 'Cancelled' },
        },
        attributes: ['id', 'shipmentId', 'loadedQty'],
      }),
      logisticsIds.length > 0 ||
      businessTxIds.length > 0 ||
      Array.from(purchaseContractIdsByShipment.values()).some(
        (ids) => ids.size > 0,
      )
        ? this.logisticsModel.findAll({
            where: {
              [Op.or]: [
                ...(logisticsIds.length > 0
                  ? [{ id: { [Op.in]: logisticsIds } }]
                  : []),
                ...(businessTxIds.length > 0
                  ? [{ businessTransactionId: { [Op.in]: businessTxIds } }]
                  : []),
                ...Array.from(purchaseContractIdsByShipment.values()).flatMap(
                  (ids) =>
                    ids.size > 0
                      ? [{ purchaseContractId: { [Op.in]: Array.from(ids) } }]
                      : [],
                ),
              ],
            },
            attributes: [
              'id',
              'businessTransactionId',
              'purchaseContractId',
              'selectedFreightId',
              'status',
            ],
          })
        : Promise.resolve([]),
    ]);

    const logisticsRecordIds = logisticsRecords.map((record) => record.id);
    const purchaseContractIds = Array.from(
      new Set(
        Array.from(purchaseContractIdsByShipment.values()).flatMap((ids) =>
          Array.from(ids),
        ),
      ),
    );
    const freightQuotes =
      shipmentIds.length > 0 ||
      logisticsRecordIds.length > 0 ||
      purchaseContractIds.length > 0
        ? await this.freightQuoteModel.findAll({
            where: {
              [Op.or]: [
                ...(shipmentIds.length > 0
                  ? [{ shipmentId: { [Op.in]: shipmentIds } }]
                  : []),
                ...(logisticsRecordIds.length > 0
                  ? [{ logisticsId: { [Op.in]: logisticsRecordIds } }]
                  : []),
                ...(purchaseContractIds.length > 0
                  ? [{ purchaseContractId: { [Op.in]: purchaseContractIds } }]
                  : []),
              ],
              isRejected: false,
            },
            attributes: [
              'id',
              'shipmentId',
              'logisticsId',
              'purchaseContractId',
              'businessTransactionId',
              'isPreferred',
              'isRejected',
            ],
          })
        : [];

    // Index allocations by shipmentId
    const allocationsByShipment = new Map<number, number>();
    for (const alloc of allocations) {
      const current = allocationsByShipment.get(alloc.shipmentId) || 0;
      allocationsByShipment.set(
        alloc.shipmentId,
        current + Number(alloc.allocatedQty || 0),
      );
    }

    // Index loadings by shipmentId
    const loadingsByShipment = new Map<number, number>();
    for (const load of loadings) {
      const current = loadingsByShipment.get(load.shipmentId) || 0;
      loadingsByShipment.set(
        load.shipmentId,
        current + Number(load.loadedQty || 0),
      );
    }

    const freightQuotesById = new Map<number, FreightQuote>();
    for (const quote of freightQuotes) {
      freightQuotesById.set(Number(quote.id), quote);
    }

    // 2. Evaluate each shipment
    for (const s of shipments) {
      const allocatedQty = allocationsByShipment.get(s.id) || 0;
      const loadedQty = loadingsByShipment.get(s.id) || 0;

      // Cargo is Ready if active allocation exists with allocatedQty > 0 or loading is active
      const cargoReady = allocatedQty > 0 || loadedQty > 0;

      // Dynamic Master-driven Freight Allocation:
      const directScSt =
        s.salesContract?.shipmentType || s.shipmentType || null;
      const directPcSt = s.purchaseContract?.shipmentType || null;
      let freightRule = freightRulesByShipment.get(s.id);
      if (freightRule === undefined && (directScSt || directPcSt)) {
        freightRule = evaluateFreightRequired(directPcSt, directScSt, s.id);
        freightRulesByShipment.set(s.id, freightRule);
      }
      const isFreightRequired =
        freightRule !== undefined && freightRule !== null
          ? freightRule.freightRequired
          : Boolean(s.freightRequired ?? s.isFreightRequired ?? false);

      let freightReady = false;
      let freightAllocationStatus: 'Yes' | 'No' = 'No';

      if (isFreightRequired) {
        const linkedPurchaseContractIds =
          purchaseContractIdsByShipment.get(s.id) ?? new Set<number>();
        const linkedBusinessTransactionIds = new Set(
          [
            s.businessTransactionId,
            s.salesContract?.businessTransactionId,
          ].filter((id): id is number => id !== null && id !== undefined),
        );
        const linkedLogistics = logisticsRecords.filter(
          (log) =>
            log.id === s.logisticsId ||
            linkedBusinessTransactionIds.has(log.businessTransactionId) ||
            linkedPurchaseContractIds.has(log.purchaseContractId),
        );
        const linkedLogisticsIds = new Set(
          linkedLogistics.map((log) => Number(log.id)),
        );
        if (s.logisticsId != null) {
          linkedLogisticsIds.add(Number(s.logisticsId));
        }

        const hasCompletedTransportAssignment = linkedLogistics.some((log) => {
          if (log.selectedFreightId == null) return false;
          const selectedQuote = freightQuotesById.get(
            Number(log.selectedFreightId),
          );
          return (
            isTransportAllocationComplete(log.status) &&
            selectedQuote !== undefined &&
            selectedQuote.isRejected !== true &&
            selectedQuote.isPreferred === true &&
            selectedQuote.shipmentId != null &&
            Number(selectedQuote.shipmentId) === Number(s.id) &&
            selectedQuote.logisticsId === log.id
          );
        });

        // Check if ANY valid (non-rejected) freight quote is associated with THIS shipmentId only
        const directShipmentQuotes = Array.isArray(s.freightQuotes)
          ? s.freightQuotes
          : [];
        const hasDirectQuote = directShipmentQuotes.some(
          (q: any) =>
            !q.isRejected &&
            q.shipmentId != null &&
            Number(q.shipmentId) === Number(s.id),
        );

        const hasValidFreightQuote =
          hasDirectQuote ||
          freightQuotes.some((quote) => {
            if (quote.isRejected) return false;
            // STRICTLY match THIS shipmentId only - NEVER contract-level or logistics-level
            return (
              quote.shipmentId != null &&
              Number(quote.shipmentId) === Number(s.id)
            );
          });

        freightReady = hasValidFreightQuote || hasCompletedTransportAssignment;
        freightAllocationStatus = freightReady ? 'Yes' : 'No';
      }

      // ── Step 1: System Readiness (Calculated Automatically) ──
      // When freight is not required, cargoReady alone satisfies system readiness.
      const systemReady = cargoReady && (!isFreightRequired || freightReady);

      // ── Step 2: Manual Readiness Override Layer ──
      const manualOverride =
        s.manualReadyOverride !== undefined && s.manualReadyOverride !== null
          ? Boolean(s.manualReadyOverride)
          : null;

      let readyForShipment = systemReady; // Final Ready Status
      let readySource: 'System' | 'Manual' = 'System';
      const isManualOverride = manualOverride !== null;

      if (manualOverride === true) {
        readyForShipment = true;
        readySource = 'Manual';
      } else if (manualOverride === false) {
        readyForShipment = false;
        readySource = 'Manual';
      } else {
        readyForShipment = systemReady;
        readySource = 'System';
      }

      // Dynamic reasons / blockers
      const reasons: string[] = [];
      if (manualOverride === false) {
        reasons.push(
          s.manualReadyReason
            ? `Manual override blocked: ${s.manualReadyReason}`
            : 'Blocked by manual override.',
        );
      } else if (manualOverride === true) {
        // Force Ready - no blocking reasons
      } else {
        if (!isFreightRequired) {
          if (!cargoReady) reasons.push('Cargo allocation is pending.');
        } else if (!cargoReady && !freightReady) {
          reasons.push('Cargo and Freight allocations are pending.');
        } else {
          if (!cargoReady) reasons.push('Cargo allocation is pending.');
          if (!freightReady) reasons.push('Freight allocation is pending.');
        }
      }

      resultMap.set(s.id, {
        cargoReady,
        freightReady,
        freightRequired: isFreightRequired,
        freightRuleReason: freightRule?.reason ?? null,
        isFreightNotApplicable: !isFreightRequired,
        freightAllocationStatus,
        systemReady,
        manualReadyOverride: manualOverride,
        manualReadyBy: s.manualReadyBy ?? null,
        manualReadyByUser: s.manualReadyByUser
          ? {
              id: s.manualReadyByUser.id,
              name: s.manualReadyByUser.firstName
                ? `${s.manualReadyByUser.firstName} ${s.manualReadyByUser.lastName || ''}`.trim()
                : s.manualReadyByUser.name || 'User',
            }
          : null,
        manualReadyAt: s.manualReadyAt ?? null,
        manualReadyReason: s.manualReadyReason ?? null,
        readyForShipment,
        isManualOverride,
        readySource,
        reasons,
      });
    }

    return resultMap;
  }

  /**
   * Evaluates readiness for a single shipment.
   */
  async evaluate(shipment: any): Promise<ShipmentReadinessResult> {
    if (!shipment) {
      return {
        cargoReady: false,
        freightReady: false,
        freightRequired: false,
        freightRuleReason: null,
        isFreightNotApplicable: true,
        freightAllocationStatus: 'No',
        systemReady: false,
        manualReadyOverride: null,
        manualReadyBy: null,
        manualReadyByUser: null,
        manualReadyAt: null,
        manualReadyReason: null,
        readyForShipment: false,
        isManualOverride: false,
        readySource: 'System',
        reasons: ['Shipment not found.'],
      };
    }
    const map = await this.evaluateBatch([shipment]);
    return (
      map.get(shipment.id) || {
        cargoReady: false,
        freightReady: false,
        freightRequired: false,
        freightRuleReason: null,
        isFreightNotApplicable: true,
        freightAllocationStatus: 'No',
        systemReady: false,
        manualReadyOverride: null,
        manualReadyBy: null,
        manualReadyByUser: null,
        manualReadyAt: null,
        manualReadyReason: null,
        readyForShipment: false,
        isManualOverride: false,
        readySource: 'System',
        reasons: ['Shipment readiness could not be determined.'],
      }
    );
  }
}
