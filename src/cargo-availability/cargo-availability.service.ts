import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel as InjectSequelizeModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
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
import { User } from '../users/models/user.model';

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
      record = await this.cargoAvailabilityModel.create({
        purchaseContractId: item.purchaseContractId,
        purchaseContractItemId: item.id,
        productId: item.productId || 0,
        purchaseQty: item.quantity || 0,
        status: 'Pending Readiness',
        companyId: item.purchaseContract?.companyId,
      });
      this.logger.log(
        `Created CargoAvailability #${record.id} for PurchaseContractItem #${item.id}`,
      );
    } else {
      record.purchaseQty = item.quantity || 0;
      record.productId = item.productId || record.productId;
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

    // a. Ready Qty
    const readyRes = await this.cargoReadinessModel.sum('readyQty', {
      where: {
        cargoAvailabilityId: record.id,
        status: 'Approved',
      },
    });
    const readyQty = Number(readyRes || 0);

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
    const readinessCount = await this.cargoReadinessModel.count({
      where: { cargoAvailabilityId: record.id },
    });
    const trucksCount = await this.cargoLoadingModel.count({
      where: { cargoAvailabilityId: record.id },
    });

    // Computed Status
    let computedStatus = 'Pending Readiness';
    if (readyQty > 0) {
      if (loadedQty >= plain.purchaseQty) {
        computedStatus = 'Completed';
      } else if (dispatchedQty > 0) {
        computedStatus = 'Dispatched';
      } else if (allocatedQty > 0) {
        computedStatus = 'Allocated';
      } else {
        computedStatus =
          readyQty >= plain.purchaseQty ? 'Ready Pool' : 'Partially Ready';
      }
    }

    return {
      ...plain,
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
  async autoSyncAllPurchaseContractItems(): Promise<void> {
    try {
      const items = await this.purchaseContractItemModel.findAll();
      for (const item of items) {
        await this.syncFromPurchaseContractItem(item.id);
      }
    } catch (err) {
      this.logger.error('Failed to auto-sync purchase contract items', err);
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
    } = query;

    // Auto-sync if grid is currently empty
    const totalCount = await this.cargoAvailabilityModel.count();
    if (totalCount === 0) {
      await this.autoSyncAllPurchaseContractItems();
    }

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (purchaseContractId) where.purchaseContractId = purchaseContractId;
    if (productId) where.productId = productId;

    const pcWhere: any = {};
    if (supplierId) pcWhere.sellerId = supplierId;
    if (search) {
      pcWhere[Op.or] = [
        { contractNumber: { [Op.iLike]: `%${search}%` } },
        { sellerContractNo: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count } = await this.cargoAvailabilityModel.findAndCountAll({
      where,
      include: [
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
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const enriched = await Promise.all(
      rows.map((row) => this.attachCalculatedMetrics(row)),
    );
    return { data: enriched, total: count };
  }

  // ─── 4. DASHBOARD KPIS STATS ─────────────────────────────────────────────
  async getStats(companyId?: number): Promise<any> {
    const count = await this.cargoAvailabilityModel.count();
    if (count === 0) {
      await this.autoSyncAllPurchaseContractItems();
    }

    const whereCond: any = {};
    if (companyId) whereCond.companyId = companyId;

    const totalPurchaseRes = await this.cargoAvailabilityModel.sum(
      'purchaseQty',
      { where: whereCond },
    );
    const totalPurchaseQty = Number(totalPurchaseRes || 0);

    const readyWhere: any = { status: 'Approved' };
    if (companyId) readyWhere.companyId = companyId;
    const totalReadyRes = await this.cargoReadinessModel.sum('readyQty', {
      where: readyWhere,
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

    const pendingReadWhere: any = { status: 'Pending Approval' };
    if (companyId) pendingReadWhere.companyId = companyId;
    const pendingReadinessCount = await this.cargoReadinessModel.count({
      where: pendingReadWhere,
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

    const shipmentWhere: any = { id: shipmentId };
    if (companyId) shipmentWhere.companyId = companyId;

    const shipment = await this.shipmentModel.findOne({
      where: shipmentWhere,
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

    if (
      cargoAvailabilityRecords.length === 0 &&
      shipmentInfo.shipment?.salesContractId
    ) {
      const pcList = await this.purchaseContractModel.findAll({
        where: { salesContractId: shipmentInfo.shipment.salesContractId },
      });
      const pcIds = pcList.map((pc) => pc.id);
      if (pcIds.length > 0) {
        const rawRecordsWhere: any = { purchaseContractId: { [Op.in]: pcIds } };
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
    const recordWhere: any = { id: dto.cargoAvailabilityId };
    if (companyId) recordWhere.companyId = companyId;
    const record = await this.cargoAvailabilityModel.findOne({
      where: recordWhere,
    });
    if (!record) {
      throw new NotFoundException(
        `CargoAvailability #${dto.cargoAvailabilityId} not found`,
      );
    }

    if (dto.warehouseId) {
      const warehouse = await Partner.findOne({
        where: { id: dto.warehouseId, companyId: record.companyId },
      });
      if (!warehouse)
        throw new BadRequestException(
          'Warehouse not found or does not belong to company',
        );
    }

    const entry = await this.cargoReadinessModel.create({
      ...dto,
      createdBy: userId,
      status: dto.status || 'Pending Approval',
      companyId: record.companyId,
    });

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

  async findAllLoading(companyId?: number): Promise<CargoLoading[]> {
    const loadingWhere: any = {};
    if (companyId) loadingWhere.companyId = companyId;
    return this.cargoLoadingModel.findAll({
      where: loadingWhere,
      include: [
        { model: CargoDocument, as: 'documents' },
        {
          model: SalesContractShipment,
          include: [
            {
              model: SalesContract,
              include: [
                { model: Partner, as: 'buyer' },
                { model: Partner, as: 'seller' },
              ],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });
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

    const shipmentInfo = await this.getShipmentInfo(dto.shipmentId, companyId);
    if (
      Number(dto.loadedQty || 0) > Number(shipmentInfo.remainingShipmentQty)
    ) {
      throw new BadRequestException(
        `Loaded Quantity (${dto.loadedQty} MT) exceeds Remaining Shipment Quantity (${shipmentInfo.remainingShipmentQty} MT).`,
      );
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
      if (Number(dto.loadedQty || 0) > Number(metrics.availableQty)) {
        throw new BadRequestException(
          `Loaded Quantity (${dto.loadedQty} MT) exceeds Available Ready Stock (${metrics.availableQty} MT).`,
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

    const loading = await this.cargoLoadingModel.create({
      ...dto,
      timeline: initialTimeline,
      status: dto.status || 'Truck Arrived',
      companyId: companyId || shipmentInfo.shipment?.salesContract?.companyId,
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
    const loading = await this.cargoLoadingModel.findOne({
      where: loadingWhere,
    });
    if (!loading) {
      throw new NotFoundException(`CargoLoading #${id} not found`);
    }

    if (dto.status) loading.status = dto.status;
    if (dto.loadedQty !== undefined) loading.loadedQty = dto.loadedQty;
    if (dto.loadedWeight !== undefined) loading.loadedWeight = dto.loadedWeight;
    if (dto.weighmentInWeight !== undefined)
      loading.weighmentInWeight = dto.weighmentInWeight;
    if (dto.weighmentOutWeight !== undefined)
      loading.weighmentOutWeight = dto.weighmentOutWeight;

    if (dto.unloadedWeight !== undefined) {
      loading.unloadedWeight = dto.unloadedWeight;
      const loadedW = Number(loading.loadedWeight || loading.loadedQty || 0);
      const diff = Math.max(0, loadedW - Number(dto.unloadedWeight));
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
    timeline.push({
      stage: dto.status || loading.status,
      timestamp: new Date().toISOString(),
      user: userId || 'System',
      remarks:
        dto.stageRemarks ||
        dto.remarks ||
        `Stage updated to ${dto.status || loading.status}`,
    });
    loading.timeline = timeline;

    await loading.save();
    return loading;
  }
}
