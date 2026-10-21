import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { CargoShipmentAllocation } from '../../cargo-availability/models/cargo-shipment-allocation.model';
import { CargoLoading } from '../../cargo-availability/models/cargo-loading.model';
import { Logistics } from '../../logistics/models/logistics.model';
import { FreightQuote } from '../../logistics/models/freight-quote.model';

export interface ShipmentReadinessResult {
  cargoReady: boolean;
  freightReady: boolean;
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
  ) {}

  /**
   * Evaluates readiness for a batch of shipments to avoid N+1 queries.
   * A shipment is ready for execution ONLY when both Cargo Allocation and Freight Allocation are completed.
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
          .map((s) => s.businessTransactionId)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    );

    // 1. Batch fetch Cargo Allocations and Loadings
    const [allocations, loadings, logisticsRecords, preferredQuotes] =
      await Promise.all([
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
        logisticsIds.length > 0 || businessTxIds.length > 0
          ? this.logisticsModel.findAll({
              where: {
                [Op.or]: [
                  ...(logisticsIds.length > 0
                    ? [{ id: { [Op.in]: logisticsIds } }]
                    : []),
                  ...(businessTxIds.length > 0
                    ? [{ businessTransactionId: { [Op.in]: businessTxIds } }]
                    : []),
                ],
              },
              attributes: [
                'id',
                'businessTransactionId',
                'selectedFreightId',
                'status',
              ],
            })
          : Promise.resolve([]),
        logisticsIds.length > 0
          ? this.freightQuoteModel.findAll({
              where: {
                logisticsId: { [Op.in]: logisticsIds },
                isPreferred: true,
              },
              attributes: ['id', 'logisticsId', 'freightAmount', 'isPreferred'],
            })
          : Promise.resolve([]),
      ]);

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

    // Index logistics by id and businessTransactionId
    const logisticsById = new Map<number, any>();
    const logisticsByBusinessTx = new Map<number, any>();
    for (const log of logisticsRecords) {
      logisticsById.set(log.id, log);
      if (log.businessTransactionId) {
        logisticsByBusinessTx.set(log.businessTransactionId, log);
      }
    }

    // Preferred quotes index by logisticsId
    const preferredQuotesByLogistics = new Set<number>();
    for (const q of preferredQuotes) {
      preferredQuotesByLogistics.add(q.logisticsId);
    }

    // 2. Evaluate each shipment
    for (const s of shipments) {
      const allocatedQty = allocationsByShipment.get(s.id) || 0;
      const loadedQty = loadingsByShipment.get(s.id) || 0;

      // Cargo is Ready if active allocation exists with allocatedQty > 0 or loading is active
      const cargoReady = allocatedQty > 0 || loadedQty > 0;

      // Freight is Ready if:
      // - Direct freight rate/charge is entered on shipment (> 0)
      // - OR linked logistics has a selected freight quote / preferred quote / ready status
      let freightReady = false;
      if (s.freight !== null && s.freight !== undefined && Number(s.freight) > 0) {
        freightReady = true;
      } else if (s.logisticsId && logisticsById.has(s.logisticsId)) {
        const log = logisticsById.get(s.logisticsId);
        if (
          log.selectedFreightId != null ||
          preferredQuotesByLogistics.has(s.logisticsId) ||
          [
            'Preferred Quote Selected',
            'Allocated',
            'Ready',
            'Booked',
            'Dispatched',
            'Completed',
          ].includes(log.status)
        ) {
          freightReady = true;
        }
      } else if (
        s.businessTransactionId &&
        logisticsByBusinessTx.has(s.businessTransactionId)
      ) {
        const log = logisticsByBusinessTx.get(s.businessTransactionId);
        if (
          log.selectedFreightId != null ||
          [
            'Preferred Quote Selected',
            'Allocated',
            'Ready',
            'Booked',
          ].includes(log.status)
        ) {
          freightReady = true;
        }
      }

      // ── Step 1: System Readiness (Calculated Automatically) ──
      const systemReady = cargoReady && freightReady;

      // ── Step 2: Manual Readiness Override Layer ──
      // IF Manual Override is NULL -> Final Ready = System Ready
      // IF Manual Override = YES  -> Final Ready = YES
      // IF Manual Override = NO   -> Final Ready = NO
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
        if (!cargoReady && !freightReady) {
          reasons.push('Cargo and Freight allocations are pending.');
        } else {
          if (!cargoReady) reasons.push('Cargo allocation is pending.');
          if (!freightReady) reasons.push('Freight allocation is pending.');
        }
      }

      resultMap.set(s.id, {
        cargoReady,
        freightReady,
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
        systemReady: false,
        manualReadyOverride: null,
        manualReadyBy: null,
        manualReadyByUser: null,
        manualReadyAt: null,
        manualReadyReason: null,
        readyForShipment: false,
        isManualOverride: false,
        readySource: 'System',
        reasons: ['Cargo and Freight allocations are pending.'],
      };
    }
    const map = await this.evaluateBatch([shipment]);
    return (
      map.get(shipment.id) || {
        cargoReady: false,
        freightReady: false,
        systemReady: false,
        manualReadyOverride: null,
        manualReadyBy: null,
        manualReadyByUser: null,
        manualReadyAt: null,
        manualReadyReason: null,
        readyForShipment: false,
        isManualOverride: false,
        readySource: 'System',
        reasons: ['Cargo and Freight allocations are pending.'],
      }
    );
  }
}
