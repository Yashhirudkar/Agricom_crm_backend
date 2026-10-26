import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  InjectConnection,
  InjectModel as InjectSequelizeModel,
} from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize as SequelizeConnection } from 'sequelize-typescript';
import { CargoAvailability } from './models/cargo-availability.model';
import { CargoReadiness } from './models/cargo-readiness.model';
import { CargoShipmentAllocation } from './models/cargo-shipment-allocation.model';
import { CargoLoading } from './models/cargo-loading.model';
import { CargoDocument } from './models/cargo-document.model';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { Product } from '../masters/product/product.model';
import { Partner } from '../masters/partner/partner.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../sales-contracts/models/sales-contract-item.model';
import { ShipmentStuffing } from '../sales-contracts/models/shipment-stuffing.model';
import { User } from '../users/models/user.model';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import {
  isBusinessReferenceSearch,
  resolveBusinessTransactionId,
} from '../system/utils/business-reference-query.util';

@Injectable()
export class CargoAvailabilityService {
  private readonly logger = new Logger(CargoAvailabilityService.name);

  constructor(
    @InjectSequelizeModel(CargoAvailability)
    private readonly cargoAvailabilityModel: typeof CargoAvailability,
    @InjectSequelizeModel(CargoReadiness)
    private readonly cargoReadinessModel: typeof CargoReadiness,
    @InjectSequelizeModel(CargoShipmentAllocation)
    private readonly cargoAllocationModel: typeof CargoShipmentAllocation,
    @InjectSequelizeModel(CargoLoading)
    private readonly cargoLoadingModel: typeof CargoLoading,
    @InjectSequelizeModel(CargoDocument)
    private readonly cargoDocumentModel: typeof CargoDocument,
    @InjectSequelizeModel(PurchaseContract)
    private readonly purchaseContractModel: typeof PurchaseContract,
    @InjectSequelizeModel(PurchaseContractItem)
    private readonly purchaseContractItemModel: typeof PurchaseContractItem,
    @InjectSequelizeModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectSequelizeModel(ShipmentStuffing)
    private readonly stuffingModel: typeof ShipmentStuffing,
    @InjectConnection()
    private readonly sequelize: SequelizeConnection,
  ) {}

  // ─── 1. AUTO-SYNC FROM PURCHASE CONTRACT ITEM ─────────────────────────────
  async syncFromPurchaseContractItem(
    itemId: number,
  ): Promise<CargoAvailability | null> {
    const item = await this.purchaseContractItemModel.findByPk(itemId, {
      include: [{ model: PurchaseContract }],
    });

    if (!item) return null;

    let record = await this.cargoAvailabilityModel.findOne({
      where: { purchaseContractItemId: item.id },
    });

    if (!record) {
      const contractItemCount = await this.purchaseContractItemModel.count({
        where: { purchaseContractId: item.purchaseContractId },
      });
      if (contractItemCount === 1) {
        record = await this.cargoAvailabilityModel.findOne({
          where: {
            purchaseContractId: item.purchaseContractId,
            purchaseContractItemId: null,
          },
        });
      }
    }

    const syncedFields = {
      purchaseContractId: item.purchaseContractId,
      businessTransactionId:
        item.purchaseContract?.businessTransactionId ?? null,
      purchaseContractItemId: item.id,
      productId: item.productId || 0,
      purchaseQty: item.quantity || 0,
      companyId: item.purchaseContract?.companyId ?? item.companyId,
    };

    if (!record) {
      record = await this.cargoAvailabilityModel.create({
        ...syncedFields,
        status: 'Pending Readiness',
      });
      this.logger.log(
        `Created CargoAvailability #${record.id} for PurchaseContractItem #${item.id}`,
      );
    } else {
      Object.assign(record, syncedFields);
      await record.save();
    }

    return record;
  }

  async syncFromPurchaseContract(contractId: number): Promise<void> {
    const items = await this.purchaseContractItemModel.findAll({
      where: { purchaseContractId: contractId },
    });

    for (const item of items) {
      await this.syncFromPurchaseContractItem(item.id);
    }
  }

  // ─── 2. DYNAMIC QUANTITIES DERIVATION ────────────────────────────────────
  async attachCalculatedMetrics(record: CargoAvailability): Promise<any> {
    const plain = record.get({ plain: true });

    // a. Check Readiness status (Agricom Simplified Workflow: Ready / Not Ready)
    const latestReadiness = await this.cargoReadinessModel.findOne({
      where: { cargoAvailabilityId: record.id },
      order: [['created_at', 'DESC']],
    });

    const isReady =
      latestReadiness &&
      (latestReadiness.status === 'Ready' ||
        latestReadiness.status === 'Approved');

    // When Ready, Ready Qty equals the full Purchase Qty without manual re-entry.
    // When Not Ready, Ready Qty is 0.
    const readyQty = isReady ? Number(plain.purchaseQty || 0) : 0;

    // b. Allocated Qty
    const allocRes = await this.cargoAllocationModel.sum('allocatedQty', {
      where: {
        cargoAvailabilityId: record.id,
        status: 'Active',
      },
    });
    const allocatedQty = Number(allocRes || 0);

    // c. Available Qty
    const availableQty = Math.max(0, readyQty - allocatedQty);

    // d. Loaded Qty
    const loadedRes = await this.cargoLoadingModel.sum('loadedQty', {
      where: {
        cargoAvailabilityId: record.id,
        status: {
          [Op.in]: [
            'Loaded',
            'Loading Completed',
            'Dispatched',
            'Reached Destination',
            'Unloaded',
            'Verified',
            'Completed',
          ],
        },
      },
    });
    const loadedQty = Number(loadedRes || 0);

    // e. Dispatched Qty
    const dispatchRes = await this.cargoLoadingModel.sum('loadedQty', {
      where: {
        cargoAvailabilityId: record.id,
        status: {
          [Op.in]: [
            'Dispatched',
            'Reached Destination',
            'Unloaded',
            'Verified',
            'Completed',
          ],
        },
      },
    });
    const dispatchedQty = Number(dispatchRes || 0);

    // f. Delivered Qty
    const deliveredRes = await this.cargoLoadingModel.sum('unloadedWeight', {
      where: {
        cargoAvailabilityId: record.id,
        status: { [Op.in]: ['Unloaded', 'Verified', 'Completed'] },
      },
    });
    const deliveredQty = Number(deliveredRes || 0);

    // Counts
    const readinessCount = latestReadiness ? 1 : 0;
    const trucksCount = await this.cargoLoadingModel.count({
      where: { cargoAvailabilityId: record.id },
    });

    // Computed Status based on Agricom Business Lifecycle:
    // Not Ready -> Ready -> Partially Allocated -> Fully Allocated -> Loading -> Dispatched -> Completed
    let computedStatus = 'Not Ready';
    if (!isReady) {
      computedStatus = 'Not Ready';
    } else {
      const isCompleted =
        (loadedQty >= Number(plain.purchaseQty || 0) && loadedQty > 0) ||
        plain.status === 'Completed';
      const isAllDispatched =
        dispatchedQty > 0 &&
        (dispatchedQty >= Number(plain.purchaseQty || 0) ||
          (allocatedQty > 0 && dispatchedQty >= allocatedQty));
      const hasTrucks = trucksCount > 0;

      if (isCompleted) {
        computedStatus = 'Completed';
      } else if (isAllDispatched) {
        computedStatus = 'Dispatched';
      } else if (hasTrucks) {
        computedStatus = 'Loading';
      } else if (allocatedQty >= readyQty && readyQty > 0) {
        computedStatus = 'Fully Allocated';
      } else if (allocatedQty > 0 && allocatedQty < readyQty) {
        computedStatus = 'Partially Allocated';
      } else {
        computedStatus = 'Ready';
      }
    }

    return {
      ...plain,
      isReady: Boolean(isReady),
      readyDate: latestReadiness?.readyDate || null,
      remarks: latestReadiness?.remarks || null,
      readyQty,
      allocatedQty,
      availableQty,
      loadedQty,
      dispatchedQty,
      deliveredQty,
      noOfReadinessEntries: readinessCount,
      noOfTrucks: trucksCount,
      status: computedStatus,
    };
  }

  // ─── 3. MAIN GRID FIND ALL ───────────────────────────────────────────────
  async autoSyncAllPurchaseContractItems(companyId?: number): Promise<void> {
    const items = await this.purchaseContractItemModel.findAll({
      include: [
        {
          model: PurchaseContract,
          ...(companyId ? { where: { companyId } } : {}),
          required: Boolean(companyId),
        },
      ],
    });
    for (const item of items) {
      await this.syncFromPurchaseContractItem(item.id);
    }
  }

  async findAll(query: any = {}): Promise<{ data: any[]; total: number }> {
    const {
      search,
      purchaseContractId,
      supplierId,
      productId,
      status,
      limit = 50,
      page = 1,
      companyId,
      businessReference,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;

    await this.autoSyncAllPurchaseContractItems(companyId);

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (purchaseContractId) where.purchaseContractId = purchaseContractId;
    if (productId) where.productId = productId;
    if (businessReference) {
      where.businessTransactionId =
        (await resolveBusinessTransactionId(
          businessReference,
          companyId,
        )) ?? -1;
    }

    const pcWhere: any = {};
    if (supplierId) pcWhere.sellerId = supplierId;
    if (search) {
      const searchConditions: any[] = [
        { contractNumber: { [Op.iLike]: `%${search}%` } },
        { sellerContractNo: { [Op.iLike]: `%${search}%` } },
      ];
      if (isBusinessReferenceSearch(search)) {
        const transactionId = await resolveBusinessTransactionId(
          search,
          companyId,
        );
        if (transactionId !== null) {
          where.businessTransactionId = transactionId;
        }
      }
      pcWhere[Op.or] = searchConditions;
    }

    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await this.cargoAvailabilityModel.findAndCountAll({
      where,
      include: [
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: PurchaseContract,
          where: Object.keys(pcWhere).length > 0 ? pcWhere : undefined,
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
          ],
        },
        { model: PurchaseContractItem },
        { model: Product },
      ],
      order:
        sortBy === 'businessReference'
          ? [
              [
                { model: BusinessTransaction, as: 'businessTransaction' },
                'businessReference',
                String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
              ],
            ]
          : [[sortBy, String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
      limit: status ? undefined : Number(limit),
      offset: status ? undefined : offset,
    });

    const enriched = await Promise.all(
      rows.map((row) => this.attachCalculatedMetrics(row)),
    );
    const filtered = status
      ? enriched.filter(
          (record: unknown) =>
            typeof record === 'object' &&
            record !== null &&
            'status' in record &&
            record.status === status,
        )
      : enriched;
    return {
      data: status ? filtered.slice(offset, offset + Number(limit)) : filtered,
      total: status ? filtered.length : count,
    };
  }

  // ─── 4. DASHBOARD KPIS STATS ─────────────────────────────────────────────
  async getStats(companyId?: number): Promise<any> {
    await this.autoSyncAllPurchaseContractItems(companyId);

    const whereCond: any = {};
    if (companyId) whereCond.companyId = companyId;

    const totalPurchaseRes = await this.cargoAvailabilityModel.sum(
      'purchaseQty',
      { where: whereCond },
    );
    const totalPurchaseQty = Number(totalPurchaseRes || 0);

    const readyReadinessEntries = await this.cargoReadinessModel.findAll({
      where: {
        status: { [Op.in]: ['Ready', 'Approved'] },
        ...(companyId ? { companyId } : {}),
      },
      attributes: ['cargoAvailabilityId', 'readyQty'],
    });
    const readyCargoIds = readyReadinessEntries.map(
      (e) => e.cargoAvailabilityId,
    );

    const totalReadyRes = await this.cargoAvailabilityModel.sum('purchaseQty', {
      where: {
        id: { [Op.in]: readyCargoIds.length > 0 ? readyCargoIds : [-1] },
        ...whereCond,
      },
    });
    const totalReadyQty = Number(totalReadyRes || 0);

    const allocWhere: any = { status: 'Active' };
    if (companyId) allocWhere.companyId = companyId;
    const totalAllocRes = await this.cargoAllocationModel.sum('allocatedQty', {
      where: allocWhere,
    });
    const totalAllocatedQty = Number(totalAllocRes || 0);

    const totalAvailableQty = Math.max(0, totalReadyQty - totalAllocatedQty);

    const loadedWhere: any = { status: { [Op.ne]: 'Cancelled' } };
    if (companyId) loadedWhere.companyId = companyId;
    const totalLoadedRes = await this.cargoLoadingModel.sum('loadedQty', {
      where: loadedWhere,
    });
    const totalLoadedQty = Number(totalLoadedRes || 0);

    const dispWhere: any = {
      status: {
        [Op.in]: [
          'Dispatched',
          'Reached Destination',
          'Unloaded',
          'Verified',
          'Completed',
        ],
      },
    };
    if (companyId) dispWhere.companyId = companyId;
    const totalDispatchedRes = await this.cargoLoadingModel.sum('loadedQty', {
      where: dispWhere,
    });
    const totalDispatchedQty = Number(totalDispatchedRes || 0);

    const delivWhere: any = {
      status: { [Op.in]: ['Unloaded', 'Verified', 'Completed'] },
    };
    if (companyId) delivWhere.companyId = companyId;
    const totalDeliveredRes = await this.cargoLoadingModel.sum(
      'unloadedWeight',
      {
        where: delivWhere,
      },
    );
    const totalDeliveredQty = Number(totalDeliveredRes || 0);

    const pendingReadinessCount = await this.cargoAvailabilityModel.count({
      where: {
        id: { [Op.notIn]: readyCargoIds.length > 0 ? readyCargoIds : [-1] },
        ...whereCond,
      },
    });

    const pendTruckWhere: any = {
      status: {
        [Op.in]: ['Draft', 'Truck Arrived', 'Weighment In', 'Loading Started'],
      },
    };
    if (companyId) pendTruckWhere.companyId = companyId;
    const pendingTrucksCount = await this.cargoLoadingModel.count({
      where: pendTruckWhere,
    });

    const pendLoadWhere: any = { status: 'Loading Started' };
    if (companyId) pendLoadWhere.companyId = companyId;
    const pendingLoadingCount = await this.cargoLoadingModel.count({
      where: pendLoadWhere,
    });

    const varWhere: any = { varianceLevel: { [Op.ne]: 'Normal' } };
    if (companyId) varWhere.companyId = companyId;
    const varianceAlertsCount = await this.cargoLoadingModel.count({
      where: varWhere,
    });

    const todayTruckWhere: any = {
      loadingDate: new Date().toISOString().split('T')[0],
    };
    if (companyId) todayTruckWhere.companyId = companyId;
    const trucksToday = await this.cargoLoadingModel.count({
      where: todayTruckWhere,
    });

    return {
      totalPurchaseQty,
      totalReadyQty,
      totalAllocatedQty,
      totalAvailableQty,
      totalLoadedQty,
      totalDispatchedQty,
      totalDeliveredQty,
      pendingReadinessCount,
      pendingLoadingCount,
      pendingTrucksCount,
      varianceAlertsCount,
      trucksLoadedToday: trucksToday,
    };
  }

  // ─── 5. FIND ONE BY ID ───────────────────────────────────────────────────
  async findOne(id: number, companyId?: number): Promise<any> {
    if (!id || isNaN(Number(id))) {
      throw new BadRequestException(`Invalid CargoAvailability ID: ${id}`);
    }

    const whereCond: any = { id };
    if (companyId) whereCond.companyId = companyId;

    const record = await this.cargoAvailabilityModel.findOne({
      where: whereCond,
      include: [
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: PurchaseContract,
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
          ],
        },
        { model: PurchaseContractItem },
        { model: Product },
        {
          model: CargoReadiness,
          include: [{ model: Partner, as: 'warehouse' }],
        },
        {
          model: CargoShipmentAllocation,
          include: [{ model: SalesContractShipment }],
        },
        {
          model: CargoLoading,
          include: [
            { model: SalesContractShipment },
            { model: CargoDocument, as: 'documents' },
          ],
        },
      ],
    });

    if (!record) {
      throw new NotFoundException(`CargoAvailability #${id} not found`);
    }

    return this.attachCalculatedMetrics(record);
  }

  // ─── 6. AUTO-FETCH SHIPMENT INFO FOR EXPORTER LOADING ────────────────────
  async getShipmentInfo(shipmentId: number, companyId?: number): Promise<any> {
    if (!shipmentId || isNaN(Number(shipmentId))) {
      throw new BadRequestException(`Invalid Shipment ID: ${shipmentId}`);
    }

    const shipment = await this.shipmentModel.findOne({
      where: { id: shipmentId },
      include: [
        {
          model: SalesContract,
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
          ],
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    if (
      companyId &&
      shipment.companyId &&
      shipment.companyId !== companyId &&
      shipment.salesContract?.companyId !== companyId
    ) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    const plainShipment = shipment.get({ plain: true });

    // Calculate loaded qty across all loading records for this shipment
    const loadedRes = await this.cargoLoadingModel.sum('loadedQty', {
      where: {
        shipmentId,
        status: { [Op.ne]: 'Cancelled' },
      },
    });
    const alreadyLoadedQty = Number(loadedRes || 0);
    const remainingShipmentQty = Math.max(
      0,
      Number(plainShipment.quantity || 0) - alreadyLoadedQty,
    );

    return {
      shipment: plainShipment,
      alreadyLoadedQty,
      remainingShipmentQty,
    };
  }

  // ─── 6.B GET ALL CARGO DATA FOR A SPECIFIC SHIPMENT (EMBEDDED DRAWER) ───
  async getByShipmentId(shipmentId: number, companyId?: number): Promise<any> {
    if (!shipmentId || isNaN(Number(shipmentId))) {
      throw new BadRequestException(`Invalid Shipment ID: ${shipmentId}`);
    }

    const shipmentInfo = await this.getShipmentInfo(shipmentId, companyId);

    const allocations = await this.cargoAllocationModel.findAll({
      where: { shipmentId, status: 'Active' },
      include: [
        {
          model: CargoAvailability,
          include: [
            {
              model: PurchaseContract,
              include: [
                { model: Partner, as: 'buyer' },
                { model: Partner, as: 'seller' },
              ],
            },
            { model: PurchaseContractItem },
            { model: Product },
            {
              model: CargoReadiness,
              include: [{ model: Partner, as: 'warehouse' }],
            },
          ],
        },
      ],
    });

    const loadingEntries = await this.cargoLoadingModel.findAll({
      where: { shipmentId },
      include: [
        { model: CargoDocument, as: 'documents' },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        { model: SalesContractShipment },
      ],
      order: [['created_at', 'DESC']],
    });

    const enrichedAllocations = await Promise.all(
      allocations.map(async (alloc) => {
        const plain = alloc.get({ plain: true });
        if (alloc.cargoAvailability) {
          plain.cargoAvailability = await this.attachCalculatedMetrics(
            alloc.cargoAvailability,
          );
        }
        return plain;
      }),
    );

    // Also check if there are standalone CargoAvailability records linked to the shipment's contract
    let cargoAvailabilityRecords = enrichedAllocations
      .map((a) => a.cargoAvailability)
      .filter(Boolean);

    if (cargoAvailabilityRecords.length === 0) {
      const pcIdSet = new Set<number>();
      if (shipmentInfo.shipment?.salesContractId) {
        const pcList = await this.purchaseContractModel.findAll({
          where: { salesContractId: shipmentInfo.shipment.salesContractId },
          attributes: ['id'],
        });
        pcList.forEach((pc) => pcIdSet.add(pc.id));
      }

      // Check linked PurchaseContractShipment
      try {
        const pcShipmentModel =
          this.shipmentModel.sequelize?.models['PurchaseContractShipment'];
        if (pcShipmentModel) {
          const pcShipments: any[] = await pcShipmentModel.findAll({
            where: { shipmentId },
            attributes: ['purchaseContractId'],
          });
          pcShipments.forEach((pcs) => {
            if (pcs.purchaseContractId) pcIdSet.add(pcs.purchaseContractId);
          });
        }
      } catch (err) {
        // Non-fatal
      }

      // Check matching businessTransactionId
      const bTxId =
        shipmentInfo.shipment?.businessTransactionId ||
        shipmentInfo.shipment?.salesContract?.businessTransactionId;
      if (bTxId) {
        const pcWithBtx = await this.purchaseContractModel.findAll({
          where: { businessTransactionId: bTxId },
          attributes: ['id'],
        });
        pcWithBtx.forEach((pc) => pcIdSet.add(pc.id));
      }

      const pcIds = Array.from(pcIdSet);
      const rawRecordsWhere: any = {};
      if (pcIds.length > 0) {
        rawRecordsWhere.purchaseContractId = { [Op.in]: pcIds };
      } else if (bTxId) {
        rawRecordsWhere.businessTransactionId = bTxId;
      }

      if (Object.keys(rawRecordsWhere).length > 0) {
        if (companyId) rawRecordsWhere.companyId = companyId;
        const rawRecords = await this.cargoAvailabilityModel.findAll({
          where: rawRecordsWhere,
          include: [
            {
              model: PurchaseContract,
              include: [
                { model: Partner, as: 'buyer' },
                { model: Partner, as: 'seller' },
              ],
            },
            { model: PurchaseContractItem },
            { model: Product },
            {
              model: CargoReadiness,
              include: [{ model: Partner, as: 'warehouse' }],
            },
          ],
        });
        cargoAvailabilityRecords = await Promise.all(
          rawRecords.map((r) => this.attachCalculatedMetrics(r)),
        );
      }
    }

    return {
      shipmentInfo,
      allocations: enrichedAllocations,
      cargoAvailabilityRecords,
      loadingEntries,
    };
  }

  // ─── 7. READINESS OPERATIONS ─────────────────────────────────────────────
  async createReadiness(
    dto: any,
    userId?: number,
    companyId?: number,
  ): Promise<CargoReadiness> {
    let record: any = null;
    if (dto.cargoAvailabilityId && !isNaN(Number(dto.cargoAvailabilityId))) {
      const recordWhere: any = { id: Number(dto.cargoAvailabilityId) };
      if (companyId) recordWhere.companyId = companyId;
      record = await this.cargoAvailabilityModel.findOne({
        where: recordWhere,
      });
    }

    if (!record && dto.shipmentId) {
      const shipment = await this.shipmentModel.findByPk(Number(dto.shipmentId), {
        include: [{ model: SalesContract }],
      });
      if (shipment) {
        const pc = await this.purchaseContractModel.findOne({
          where: shipment.salesContractId
            ? { salesContractId: shipment.salesContractId }
            : { businessTransactionId: shipment.businessTransactionId },
        });
        if (pc) {
          record = await this.cargoAvailabilityModel.findOne({
            where: { purchaseContractId: pc.id },
          });
          if (!record) {
            record = await this.cargoAvailabilityModel.create({
              purchaseContractId: pc.id,
              purchaseQty: shipment.quantity || 0,
              status: 'Pending Readiness',
              companyId: shipment.companyId || companyId || 1,
              businessTransactionId: shipment.businessTransactionId,
            });
          }
        } else {
          record = await this.cargoAvailabilityModel.create({
            purchaseContractId: null,
            purchaseQty: shipment.quantity || 0,
            status: 'Pending Readiness',
            companyId: shipment.companyId || companyId || 1,
            businessTransactionId: shipment.businessTransactionId,
          });
        }
      }
    }

    if (!record) {
      throw new NotFoundException(
        `CargoAvailability record could not be resolved for ID #${dto.cargoAvailabilityId || 'null'} / Shipment #${dto.shipmentId}`,
      );
    }

    const isReady = dto.status === 'Ready';

    // If changing to 'Not Ready', deactivate allocation for this shipment if provided
    if (!isReady) {
      if (dto.shipmentId) {
        await this.cargoAllocationModel.update(
          { status: 'Cancelled' },
          {
            where: {
              cargoAvailabilityId: record.id,
              shipmentId: Number(dto.shipmentId),
              status: 'Active',
            },
          },
        );
      }
      const activeAllocations = await this.cargoAllocationModel.count({
        where: {
          cargoAvailabilityId: record.id,
          status: 'Active',
        },
      });
      if (activeAllocations > 0 && !dto.shipmentId) {
        throw new BadRequestException(
          'Cannot mark cargo as Not Ready because active allocations exist. Please cancel allocations first.',
        );
      }
    } else if (isReady && dto.shipmentId) {
      // If marked Ready with shipmentId, ensure active allocation is created/reactivated
      const existingAlloc = await this.cargoAllocationModel.findOne({
        where: {
          cargoAvailabilityId: record.id,
          shipmentId: Number(dto.shipmentId),
        },
      });
      if (!existingAlloc) {
        const shipment = await this.shipmentModel.findByPk(Number(dto.shipmentId));
        const allocQty = Math.min(
          Number(shipment?.quantity || record.purchaseQty || 0),
          Number(record.purchaseQty || 0),
        );
        if (allocQty > 0) {
          await this.cargoAllocationModel.create({
            cargoAvailabilityId: record.id,
            shipmentId: Number(dto.shipmentId),
            allocatedQty: allocQty,
            status: 'Active',
            allocatedBy: userId,
            allocatedAt: new Date(),
            companyId: record.companyId,
          });
        }
      } else if (existingAlloc.status !== 'Active') {
        existingAlloc.status = 'Active';
        await existingAlloc.save();
      }
    }

    const readyDate = dto.readyDate || new Date().toISOString().split('T')[0];
    const readyQty = isReady ? Number(record.purchaseQty || 0) : 0;

    let entry = await this.cargoReadinessModel.findOne({
      where: { cargoAvailabilityId: record.id },
    });

    if (entry) {
      entry.status = dto.status || (isReady ? 'Ready' : 'Not Ready');
      entry.readyDate = readyDate;
      entry.readyQty = readyQty;
      entry.remarks = dto.remarks || null;
      entry.createdBy = userId || entry.createdBy;
      await entry.save();
    } else {
      entry = await this.cargoReadinessModel.create({
        cargoAvailabilityId: record.id,
        companyId: record.companyId,
        status: dto.status || (isReady ? 'Ready' : 'Not Ready'),
        readyDate,
        readyQty,
        bagBulk: 'Bulk',
        uom: 'MT',
        remarks: dto.remarks || null,
        createdBy: userId,
      });
    }

    record.status = isReady ? 'Ready' : 'Not Ready';
    await record.save();

    return entry;
  }

  async approveReadiness(
    id: number,
    status: string,
    userId?: number,
    companyId?: number,
  ): Promise<CargoReadiness> {
    const entryWhere: any = { id };
    if (companyId) entryWhere.companyId = companyId;
    const entry = await this.cargoReadinessModel.findOne({ where: entryWhere });
    if (!entry) {
      throw new NotFoundException(`CargoReadiness #${id} not found`);
    }

    entry.status = status;
    if (status === 'Approved') {
      entry.approvedBy = userId || null;
      entry.approvedAt = new Date();
    }
    await entry.save();
    return entry;
  }

  // ─── 8. SHIPMENT ALLOCATION OPERATIONS ───────────────────────────────────
  async createAllocation(
    dto: any,
    userId?: number,
    companyId?: number,
  ): Promise<CargoShipmentAllocation> {
    const cargoWhere: any = { id: dto.cargoAvailabilityId };
    if (companyId) cargoWhere.companyId = companyId;
    const cargo = await this.cargoAvailabilityModel.findOne({
      where: cargoWhere,
    });
    if (!cargo) {
      throw new NotFoundException(
        `CargoAvailability #${dto.cargoAvailabilityId} not found`,
      );
    }

    if (dto.shipmentId) {
      const shipment = await this.shipmentModel.findOne({
        where: { id: dto.shipmentId },
        include: [
          { model: SalesContract, where: { companyId: cargo.companyId } },
        ],
      });
      if (!shipment)
        throw new BadRequestException(
          'Shipment not found or does not belong to company',
        );
    }

    const metrics = await this.attachCalculatedMetrics(cargo);
    if (Number(dto.allocatedQty) > Number(metrics.availableQty)) {
      throw new BadRequestException(
        `Cannot allocate ${dto.allocatedQty} MT. Available Ready Qty is only ${metrics.availableQty} MT.`,
      );
    }

    const allocation = await this.cargoAllocationModel.create({
      cargoAvailabilityId: dto.cargoAvailabilityId,
      shipmentId: dto.shipmentId,
      allocatedQty: dto.allocatedQty,
      status: 'Active',
      allocatedBy: userId,
      allocatedAt: new Date(),
      companyId: cargo.companyId,
    });

    return allocation;
  }

  public async syncExecutedShipmentLoadings(companyId?: number): Promise<void> {
    try {
      const shipmentWhere: any = {
        status: { [Op.in]: ['Executed', 'Stuffed', 'Dispatched', 'Completed'] },
      };
      const shipments = await this.shipmentModel.findAll({
        where: shipmentWhere,
        include: [
          {
            model: SalesContract,
            as: 'salesContract',
            attributes: [
              'id',
              'companyId',
              'businessTransactionId',
              'contractNumber',
            ],
            include: [
              { model: Partner, as: 'buyer' },
              { model: Partner, as: 'seller' },
              {
                model: SalesContractItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }],
              },
            ],
            required: false,
          },
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
            attributes: ['id', 'businessReference'],
            required: false,
          },
        ],
      });

      for (const shipment of shipments) {
        const resolvedCompanyId =
          shipment.companyId ?? shipment.salesContract?.companyId ?? null;
        if (companyId && resolvedCompanyId && resolvedCompanyId !== companyId) {
          continue;
        }

        const resolvedBusinessTxId =
          shipment.businessTransactionId ??
          shipment.salesContract?.businessTransactionId ??
          null;

        const allocation = await this.cargoAllocationModel.findOne({
          where: { shipmentId: shipment.id, status: 'Active' },
          order: [['createdAt', 'ASC']],
        });

        // 1. Check or create CargoLoading
        let existingLoading = await this.cargoLoadingModel.findOne({
          where: { shipmentId: shipment.id },
        });

        if (!existingLoading) {
          existingLoading = await this.cargoLoadingModel.create({
            companyId: resolvedCompanyId,
            businessTransactionId: resolvedBusinessTxId,
            cargoAvailabilityId: allocation?.cargoAvailabilityId ?? null,
            shipmentAllocationId: allocation?.id ?? null,
            shipmentId: shipment.id,
            truckNo: null,
            warehouseName: 'Main Warehouse',
            loadedQty: 0,
            loadedWeight: 0,
            status: shipment.executionStatus || 'Pending',
            warehouseStatus: 'Pending',
            timeline: [
              {
                stage: shipment.executionStatus || 'Pending',
                timestamp: new Date().toISOString(),
                user: 'System',
                remarks: 'Auto-created Stuffing Job from Shipment Execution',
              },
            ],
            remarks: 'Initialized from Shipment Execution.',
          });
        } else {
          let updated = false;
          if (!existingLoading.companyId && resolvedCompanyId) {
            existingLoading.companyId = resolvedCompanyId;
            updated = true;
          }
          if (!existingLoading.businessTransactionId && resolvedBusinessTxId) {
            existingLoading.businessTransactionId = resolvedBusinessTxId;
            updated = true;
          }
          if (!existingLoading.shipmentAllocationId && allocation?.id) {
            existingLoading.shipmentAllocationId = allocation.id;
            existingLoading.cargoAvailabilityId = allocation.cargoAvailabilityId;
            updated = true;
          }
          if (updated) {
            await existingLoading.save();
          }
        }

        // 2. Check or create ShipmentStuffing
        let existingStuffing = await this.stuffingModel.findOne({
          where: { shipmentId: shipment.id },
        });

        if (!existingStuffing) {
          const firstItem = shipment.salesContract?.items?.[0];
          await this.stuffingModel.create({
            companyId: resolvedCompanyId,
            shipmentId: shipment.id,
            salesContractId: shipment.salesContractId,
            stuffingStatus: 'Pending',
            executionStatus: shipment.executionStatus || 'Pending',
            warehouseStatus: 'Pending',
            loadingStatus: 'Pending',
            autoPopulatedData: {
              shipmentRef:
                shipment.shipmentReference || `Shipment #${shipment.id}`,
              shipmentNo: shipment.shipmentNo,
              shipmentDate: shipment.shipmentDate,
              quantityMt: Number(shipment.quantity || 0),
              noOfContainers: shipment.noOfContainers || 1,
              businessRefNo:
                shipment.businessTransaction?.businessReference ||
                'N/A',
              salesContractNo:
                shipment.salesContract?.contractNumber || 'N/A',
              buyerName: shipment.salesContract?.buyer?.entityName || 'N/A',
              sellerCompany:
                shipment.salesContract?.seller?.entityName || 'N/A',
              product: firstItem?.product?.name || 'Agri Commodity',
              allocatedWeight: allocation
                ? Number(allocation.allocatedQty || 0)
                : Number(shipment.quantity || 0),
              warehouse: 'Main Warehouse',
            },
            remarks: 'Initialized automatically from Shipment Execution.',
          });
        } else {
          let stuffingUpdated = false;
          if (!existingStuffing.companyId && resolvedCompanyId) {
            existingStuffing.companyId = resolvedCompanyId;
            stuffingUpdated = true;
          }
          if (
            existingStuffing.stuffingStatus === 'Draft' ||
            existingStuffing.executionStatus === 'Draft'
          ) {
            existingStuffing.stuffingStatus = 'Pending';
            existingStuffing.executionStatus = 'Pending';
            stuffingUpdated = true;
          }
          if (stuffingUpdated) {
            await existingStuffing.save();
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `[syncExecutedShipmentLoadings] Sync warning: ${err?.message}`,
      );
    }
  }

  async findAllLoading(
    companyId?: number,
    query: any = {},
  ): Promise<CargoLoading[]> {
    await this.syncExecutedShipmentLoadings(companyId);

    const loadingWhere: any = {};
    if (companyId) {
      loadingWhere[Op.or] = [
        { companyId },
        { '$shipment.salesContract.company_id$': companyId },
      ];
    }
    if (query.businessReference) {
      loadingWhere.businessTransactionId =
        (await resolveBusinessTransactionId(
          query.businessReference,
          companyId,
        )) ?? -1;
    }
    if (query.search && isBusinessReferenceSearch(query.search)) {
      loadingWhere.businessTransactionId =
        (await resolveBusinessTransactionId(query.search, companyId)) ?? -1;
    } else if (query.search) {
      const search = `%${String(query.search).trim()}%`;
      loadingWhere[Op.or] = [
        { truckNo: { [Op.iLike]: search } },
        { containerNumber: { [Op.iLike]: search } },
        { businessTransactionId: Number(query.search) || -1 },
        { '$shipment.shipmentReference$': { [Op.iLike]: search } },
        { '$shipment.salesContract.contractNumber$': { [Op.iLike]: search } },
        { '$shipment.salesContract.buyer.entityName$': { [Op.iLike]: search } },
        { '$shipment.salesContract.seller.entityName$': { [Op.iLike]: search } },
        { '$shipment.salesContract.items.product.name$': { [Op.iLike]: search } },
      ];
    }
    if (query.status) loadingWhere.status = query.status;
    if (query.dateFrom || query.dateTo) {
      loadingWhere.loadingDate = {};
      if (query.dateFrom) loadingWhere.loadingDate[Op.gte] = query.dateFrom;
      if (query.dateTo) loadingWhere.loadingDate[Op.lte] = query.dateTo;
    }
    if (query.shipmentReference) {
      loadingWhere['$shipment.shipmentReference$'] = {
        [Op.iLike]: `%${String(query.shipmentReference).trim()}%`,
      };
    }
    if (query.buyer) {
      loadingWhere['$shipment.salesContract.buyer.entityName$'] = {
        [Op.iLike]: `%${String(query.buyer).trim()}%`,
      };
    }
    if (query.seller) {
      loadingWhere['$shipment.salesContract.seller.entityName$'] = {
        [Op.iLike]: `%${String(query.seller).trim()}%`,
      };
    }
    if (query.product) {
      loadingWhere['$shipment.salesContract.items.product.name$'] = {
        [Op.iLike]: `%${String(query.product).trim()}%`,
      };
    }
    const entries = await this.cargoLoadingModel.findAll({
      where: loadingWhere,
      include: [
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        { model: CargoDocument, as: 'documents' },
        {
          model: CargoShipmentAllocation,
          as: 'shipmentAllocation',
          attributes: ['id', 'allocatedQty', 'cargoAvailabilityId'],
          required: false,
        },
        {
          model: SalesContractShipment,
          as: 'shipment',
          attributes: ['id', 'shipmentReference', 'quantity', 'status', 'executionStatus', 'salesContractId'],
          include: [
            {
              model: SalesContract,
              as: 'salesContract',
              include: [
                { model: Partner, as: 'buyer' },
                { model: Partner, as: 'seller' },
                {
                  model: SalesContractItem,
                  as: 'items',
                  include: [{ model: Product, as: 'product' }],
                },
                {
                  model: PurchaseContract,
                  as: 'purchaseContracts',
                  attributes: ['id', 'contractNumber', 'status'],
                },
              ],
            },
          ],
        },
      ],
      order:
        query.sortBy === 'businessReference'
          ? [
              [
                { model: BusinessTransaction, as: 'businessTransaction' },
                'businessReference',
                String(query.sortOrder).toUpperCase() === 'ASC'
                  ? 'ASC'
                  : 'DESC',
              ],
            ]
          : [['created_at', 'DESC']],
    });
    const shipmentIds = [
      ...new Set(entries.map((entry) => entry.shipmentId).filter(Boolean)),
    ];
    const allShipmentLoading = shipmentIds.length
      ? await this.cargoLoadingModel.findAll({
          where: { shipmentId: { [Op.in]: shipmentIds } },
          attributes: ['shipmentId', 'loadedQty'],
        })
      : [];
    const loadedByShipment = new Map<number, number>();
    for (const entry of allShipmentLoading) {
      loadedByShipment.set(
        entry.shipmentId,
        (loadedByShipment.get(entry.shipmentId) || 0) +
          Number(entry.loadedQty || 0),
      );
    }
    return entries.map((entry) => {
      const plain = entry.get({ plain: true }) as any;
      const shipmentQuantity = Number(plain.shipment?.quantity || 0);
      const remainingQty = Math.max(
        0,
        shipmentQuantity - (loadedByShipment.get(entry.shipmentId) || 0),
      );
      Object.assign(entry, { remainingQty });
      return entry;
    });
  }

  async getLoadingMetrics(companyId?: number) {
    await this.syncExecutedShipmentLoadings(companyId);

    const where: any = {};
    if (companyId) {
      where[Op.or] = [
        { companyId },
        { '$shipment.salesContract.company_id$': companyId },
      ];
    }
    const rows = await this.cargoLoadingModel.findAll({
      where,
      attributes: ['shipmentId', 'status', 'loadedQty', 'loadingDate'],
      include: [
        {
          model: SalesContractShipment,
          as: 'shipment',
          attributes: ['id', 'quantity'],
          required: false,
          include: [
            {
              model: SalesContract,
              as: 'salesContract',
              attributes: ['id', 'companyId'],
              required: false,
            },
          ],
        },
      ],
    });
    const byShipment = new Map<number, { quantity: number; loaded: number }>();
    let totalLoadedQuantity = 0;
    let todaysLoading = 0;
    const today = new Date().toISOString().slice(0, 10);
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    for (const row of rows) {
      const plain = row.get({ plain: true }) as any;
      const loadedQty = Number(plain.loadedQty || 0);
      totalLoadedQuantity += loadedQty;
      if (plain.loadingDate === today) todaysLoading += loadedQty;
      if (['Pending', 'Draft', 'Ready'].includes(plain.status)) pending += 1;
      else if (['Completed', 'Verified'].includes(plain.status)) completed += 1;
      else inProgress += 1;
      if (plain.shipmentId) {
        const aggregate = byShipment.get(plain.shipmentId) || {
          quantity: Number(plain.shipment?.quantity || 0),
          loaded: 0,
        };
        aggregate.loaded += loadedQty;
        byShipment.set(plain.shipmentId, aggregate);
      }
    }
    const remainingQuantity = [...byShipment.values()].reduce(
      (sum, shipment) => sum + Math.max(0, shipment.quantity - shipment.loaded),
      0,
    );
    return {
      totalStuffingJobs: byShipment.size,
      pending,
      inProgress,
      completed,
      todaysLoading,
      totalLoadedQuantity,
      remainingQuantity,
    };
  }

  // ─── 9. EXPORTER LOADING OPERATIONS ──────────────────────────────────────
  async createLoading(
    dto: any,
    userId?: number,
    companyId?: number,
  ): Promise<CargoLoading> {
    // a. Hard block duplicate truck check on same date
    if (dto.truckNo && dto.loadingDate) {
      const activeTruckWhere: any = {
        truckNo: dto.truckNo,
        loadingDate: dto.loadingDate,
        status: { [Op.notIn]: ['Completed', 'Cancelled'] },
      };
      if (companyId) activeTruckWhere.companyId = companyId;
      const activeTruck = await this.cargoLoadingModel.findOne({
        where: activeTruckWhere,
      });

      if (activeTruck) {
        throw new BadRequestException(
          `Truck ${dto.truckNo} is already actively assigned on ${dto.loadingDate} (Record #${activeTruck.id}).`,
        );
      }
    }

    // b. Validate Shipment Quantity
    if (!dto.shipmentId) {
      throw new BadRequestException(
        'Selecting a Shipment is mandatory for truck loading execution.',
      );
    }
    if (!dto.truckNo) {
      throw new BadRequestException(
        'A truck number is required to start warehouse loading.',
      );
    }

    const shipmentInfo = await this.getShipmentInfo(dto.shipmentId, companyId);
    const loadedQty = Number(dto.loadedQty || dto.loadedWeight || 0);
    if (!Number.isFinite(loadedQty) || loadedQty < 0) {
      throw new BadRequestException('Loaded quantity cannot be negative.');
    }
    if (
      loadedQty > Number(shipmentInfo.remainingShipmentQty)
    ) {
      throw new BadRequestException(
        `Loaded Quantity (${loadedQty} MT) exceeds Remaining Shipment Quantity (${shipmentInfo.remainingShipmentQty} MT).`,
      );
    }
    if (dto.containerNumber) {
      const existingContainer = await this.cargoLoadingModel.findOne({
        where: {
          containerNumber: String(dto.containerNumber).trim().toUpperCase(),
          status: { [Op.notIn]: ['Cancelled'] },
        },
      });
      if (existingContainer) {
        throw new BadRequestException(
          `Container ${dto.containerNumber} is already assigned to loading record #${existingContainer.id}.`,
        );
      }
    }

    // c. Validate Available Ready Stock (only if a cargo availability record is linked)
    if (dto.cargoAvailabilityId) {
      const cargoWhere: any = { id: dto.cargoAvailabilityId };
      if (companyId) cargoWhere.companyId = companyId;
      const cargo = await this.cargoAvailabilityModel.findOne({
        where: cargoWhere,
      });
      if (!cargo) {
        throw new NotFoundException(
          `CargoAvailability #${dto.cargoAvailabilityId} not found`,
        );
      }

      const metrics = await this.attachCalculatedMetrics(cargo);
      if (loadedQty > Number(metrics.availableQty)) {
        throw new BadRequestException(
          `Loaded Quantity (${loadedQty} MT) exceeds Available Ready Stock (${metrics.availableQty} MT).`,
        );
      }
    }

    const initialTimeline = [
      {
        stage: 'Truck Arrived',
        timestamp: new Date().toISOString(),
        user: userId || 'System',
        remarks: dto.remarks || 'Truck checked in at yard',
      },
    ];

    const loading = await this.sequelize.transaction(async (transaction) => {
      const shipment = await this.shipmentModel.findByPk(dto.shipmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!shipment) {
        throw new NotFoundException(`Shipment #${dto.shipmentId} not found`);
      }
      if (shipment.status !== 'Executed') {
        throw new BadRequestException(
          'Warehouse loading can only start after shipment execution.',
        );
      }

      const defaults = {
        ...dto,
        timeline: initialTimeline,
        status: 'Truck Arrived',
        warehouseStatus: 'Ready',
        businessTransactionId: shipment.businessTransactionId ?? null,
        companyId: companyId || shipment.companyId,
      };
      const pendingEntry = await this.cargoLoadingModel.findOne({
        where: {
          shipmentId: shipment.id,
          truckNo: null,
          status: { [Op.in]: ['Draft', 'Pending', 'Ready'] },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      let loading: CargoLoading;
      if (pendingEntry) {
        loading = pendingEntry;
        Object.assign(loading, defaults);
        loading.timeline = [
          ...(pendingEntry.timeline || []),
          ...initialTimeline,
        ];
        await loading.save({ transaction });
      } else {
        loading = await this.cargoLoadingModel.create(defaults, {
          transaction,
        });
      }
      shipment.executionStatus = loading.status;
      await shipment.save({ transaction });
      const stuffing = await this.stuffingModel.findOne({
        where: { shipmentId: shipment.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (stuffing) {
        stuffing.warehouseStatus = 'Ready';
        stuffing.loadingStatus = loading.status;
        stuffing.executionStatus = loading.status;
        await stuffing.save({ transaction });
      }
      return loading;
    });

    return loading;
  }

  async updateLoadingStatus(
    id: number,
    dto: any,
    userId?: number,
    companyId?: number,
  ): Promise<CargoLoading> {
    const loadingWhere: any = { id };
    if (companyId) loadingWhere.companyId = companyId;
    return this.sequelize.transaction(async (transaction) => {
      const loading = await this.cargoLoadingModel.findOne({
        where: loadingWhere,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!loading) {
        throw new NotFoundException(`CargoLoading #${id} not found`);
      }

      const shipment = await this.shipmentModel.findByPk(loading.shipmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!shipment) {
        throw new NotFoundException(
          `Shipment #${loading.shipmentId} linked to loading record was not found`,
        );
      }

    if (dto.warehouseName !== undefined) {
      loading.warehouseName = dto.warehouseName;
    }
    if (dto.loadingDate !== undefined) loading.loadingDate = dto.loadingDate;
    if (dto.loadingStartTime !== undefined)
      loading.loadingStartTime = dto.loadingStartTime;
    if (dto.loadingEndTime !== undefined)
      loading.loadingEndTime = dto.loadingEndTime;
    if (dto.operator !== undefined) loading.operator = dto.operator;
    if (dto.arrivalTime !== undefined) loading.arrivalTime = dto.arrivalTime;
    if (dto.truckNo !== undefined) loading.truckNo = dto.truckNo || null;
    if (dto.trailerNo !== undefined) loading.trailerNo = dto.trailerNo;
    if (dto.driverName !== undefined) loading.driverName = dto.driverName;
    if (dto.driverMobile !== undefined) loading.driverMobile = dto.driverMobile;
    if (dto.transporter !== undefined) loading.transporter = dto.transporter;
    if (dto.licenseNumber !== undefined)
      loading.licenseNumber = dto.licenseNumber;
    if (dto.vehicleType !== undefined) loading.vehicleType = dto.vehicleType;
    if (dto.bagBulk !== undefined) loading.bagBulk = dto.bagBulk;
    if (dto.bagsCount !== undefined) loading.bagsCount = dto.bagsCount;
    if (dto.avgBagWeight !== undefined)
      loading.avgBagWeight = dto.avgBagWeight;
    if (dto.sealNumber !== undefined) loading.sealNumber = dto.sealNumber;
    if (dto.containerNumber !== undefined)
      loading.containerNumber = dto.containerNumber;
    if (dto.loadingLocation !== undefined)
      loading.loadingLocation = dto.loadingLocation;
    if (dto.stackNumber !== undefined) loading.stackNumber = dto.stackNumber;
    if (dto.lotNumber !== undefined) loading.lotNumber = dto.lotNumber;
    if (dto.batchNumber !== undefined) loading.batchNumber = dto.batchNumber;
    if (dto.unloadLocation !== undefined)
      loading.unloadLocation = dto.unloadLocation;
    if (dto.ewayBillNo !== undefined) loading.ewayBillNo = dto.ewayBillNo;
    if (dto.lrNumber !== undefined) loading.lrNumber = dto.lrNumber;
    if (dto.invoiceNumber !== undefined)
      loading.invoiceNumber = dto.invoiceNumber;
    if (dto.gatePassNumber !== undefined)
      loading.gatePassNumber = dto.gatePassNumber;
    if (dto.status) {
      const currentRank = this.getLoadingStatusRank(loading.status);
      const nextRank = this.getLoadingStatusRank(dto.status);
      if (nextRank < 0) {
        throw new BadRequestException(`Unsupported loading status: ${dto.status}`);
      }
      if (currentRank >= 0 && nextRank < currentRank) {
        throw new BadRequestException(
          'Loading execution status cannot move backwards.',
        );
      }
      loading.status = dto.status;
    }
    if (dto.loadedQty !== undefined || dto.loadedWeight !== undefined) {
      const loadedQty = Number(dto.loadedQty ?? dto.loadedWeight);
      if (!Number.isFinite(loadedQty) || loadedQty < 0) {
        throw new BadRequestException('Loaded quantity cannot be negative.');
      }
      const otherLoadedQty = Number(
        (await this.cargoLoadingModel.sum('loadedQty', {
          where: { shipmentId: shipment.id, id: { [Op.ne]: loading.id } },
          transaction,
        })) || 0,
      );
      if (otherLoadedQty + loadedQty > Number(shipment.quantity || 0)) {
        throw new BadRequestException(
          `Total loaded quantity cannot exceed shipment quantity (${shipment.quantity} MT).`,
        );
      }
      if (loading.shipmentAllocationId) {
        const allocation = await this.cargoAllocationModel.findByPk(
          loading.shipmentAllocationId,
          { transaction },
        );
        if (
          allocation &&
          otherLoadedQty + loadedQty > Number(allocation.allocatedQty || 0)
        ) {
          throw new BadRequestException(
            `Total loaded quantity cannot exceed cargo allocation (${allocation.allocatedQty} MT).`,
          );
        }
      }
      if (dto.loadedQty !== undefined) loading.loadedQty = loadedQty;
      if (dto.loadedWeight !== undefined) loading.loadedWeight = loadedQty;
    }
    if (dto.weighmentInWeight !== undefined)
      loading.weighmentInWeight = dto.weighmentInWeight;
    if (dto.weighmentOutWeight !== undefined)
      loading.weighmentOutWeight = dto.weighmentOutWeight;

    if (dto.unloadedWeight !== undefined) {
      const unloadedWeight = Number(dto.unloadedWeight);
      if (!Number.isFinite(unloadedWeight) || unloadedWeight < 0) {
        throw new BadRequestException('Unloaded quantity cannot be negative.');
      }
      loading.unloadedWeight = dto.unloadedWeight;
      const loadedW = Number(loading.loadedWeight || loading.loadedQty || 0);
      if (unloadedWeight > loadedW) {
        throw new BadRequestException(
          'Unloaded quantity cannot exceed the loaded quantity.',
        );
      }
      const diff = Math.max(0, loadedW - unloadedWeight);
      loading.weightDifference = diff;

      if (loadedW > 0) {
        const variancePct = (diff / loadedW) * 100;
        if (variancePct <= 0.5) {
          loading.varianceLevel = 'Normal';
          loading.verificationStatus = 'Verified Normal';
        } else if (variancePct <= 1.0) {
          loading.varianceLevel = 'Yellow Alert';
          loading.verificationStatus = 'Variance Flagged';
        } else if (variancePct <= 2.0) {
          loading.varianceLevel = 'Orange Alert';
          loading.verificationStatus = 'Variance Flagged';
        } else {
          loading.varianceLevel = 'Red Claim Required';
          loading.verificationStatus = 'Claim Raised';
        }
      }
    }

    if (dto.shortQty !== undefined) loading.shortQty = dto.shortQty;
    if (dto.damageQty !== undefined) loading.damageQty = dto.damageQty;
    if (dto.differenceReason) loading.differenceReason = dto.differenceReason;
    if (dto.remarks) loading.remarks = dto.remarks;

    // Timeline update
    const timeline = loading.timeline || [];
    const statusChanged =
      Boolean(dto.status) && timeline[timeline.length - 1]?.stage !== loading.status;
    if (statusChanged) {
      timeline.push({
        stage: loading.status,
        timestamp: new Date().toISOString(),
        user: userId || 'System',
        remarks:
          dto.stageRemarks ||
          dto.remarks ||
          `Stage updated to ${loading.status}`,
      });
    }
    loading.timeline = timeline;

    const status = loading.status;
    if (
      this.getLoadingStatusRank(status) >=
        this.getLoadingStatusRank('Loading Completed') &&
      Number(loading.loadedQty || loading.loadedWeight || 0) <= 0
    ) {
      throw new BadRequestException(
        'Enter a positive loaded quantity before completing loading.',
      );
    }
    loading.warehouseStatus =
      [
        'Loading Completed',
        'Stuffing Completed',
        'Completed',
        'Verified',
        'Unloaded',
        'Reached Destination',
        'Dispatched',
      ].includes(status)
        ? 'Completed'
        : [
            'Stuffing Started',
            'Stuffing In Progress',
            'Loading Started',
            'Weighment Out',
            'Ready For Dispatch',
          ].includes(status)
          ? 'In Progress'
          : status === 'Ready' || status === 'Truck Arrived'
            ? 'Ready'
            : 'Pending';
    await loading.save({ transaction });

    const stuffing = await this.stuffingModel.findOne({
      where: { shipmentId: shipment.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (stuffing) {
      stuffing.warehouseStatus = loading.warehouseStatus;
      stuffing.loadingStatus = status;
      stuffing.executionStatus = status;
      const statusRank = this.getLoadingStatusRank(status);
      stuffing.stuffingStatus =
        statusRank >= this.getLoadingStatusRank('Stuffing Completed')
          ? 'Completed'
          : statusRank >= this.getLoadingStatusRank('Stuffing Started')
            ? 'In Progress'
            : 'Pending';
      if (dto.warehouseName !== undefined) {
        stuffing.stuffingLocation = dto.warehouseName;
      }
      if (dto.operator) {
        stuffing.operator = dto.operator;
      }
      if (loading.containerNumber) {
        const containers = Array.isArray(stuffing.containers)
          ? [...stuffing.containers]
          : [];
        const matchIdx = containers.findIndex(
          (c: any) => c.containerNo === loading.containerNumber,
        );
        if (matchIdx >= 0) {
          containers[matchIdx] = {
            ...containers[matchIdx],
            status,
            vehicleNumber: loading.truckNo || containers[matchIdx].vehicleNumber,
            sealNo: loading.sealNumber || containers[matchIdx].sealNo,
            warehouse: loading.warehouseName || containers[matchIdx].warehouse,
            netWeight: Number(
              loading.loadedWeight ||
                loading.loadedQty ||
                containers[matchIdx].netWeight ||
                0,
            ),
          };
          stuffing.containers = containers;
        } else if (containers.length === 0) {
          stuffing.containers = [
            {
              containerNo: loading.containerNumber,
              containerSize: '40 FT',
              vehicleNumber: loading.truckNo || '',
              sealNo: loading.sealNumber || '',
              stuffingDate: loading.loadingDate || '',
              warehouse: loading.warehouseName || '',
              status,
              remarks: loading.remarks || '',
              tareWeight: 0,
              grossWeight: Number(
                loading.loadedWeight || loading.loadedQty || 0,
              ),
              netWeight: Number(loading.loadedWeight || loading.loadedQty || 0),
            },
          ];
        }
      }
      await stuffing.save({ transaction });
    }
    shipment.executionStatus = status;
    if (status === 'Completed') shipment.status = 'Completed';
    else if (status === 'Dispatched') shipment.status = 'Dispatched';
    else if (shipment.status !== 'Completed') shipment.status = 'Executed';
    await shipment.save({ transaction });

    return loading;
    });
  }

  private getLoadingStatusRank(status: string): number {
    return [
      'Draft',
      'Pending',
      'Ready',
      'Truck Arrived',
      'Weighment In',
      'Stuffing Started',
      'Loading Started',
      'Stuffing In Progress',
      'Stuffing Completed',
      'Loading Completed',
      'Weighment Out',
      'Ready For Dispatch',
      'Dispatched',
      'Reached Destination',
      'Unloaded',
      'Verified',
      'Completed',
    ].indexOf(status);
  }
}
