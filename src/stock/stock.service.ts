import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, Op, where } from 'sequelize';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../purchase-contracts/models/purchase-contract-shipment.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../sales-contracts/models/sales-contract-item.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { Product } from '../masters/product/product.model';
import { Country } from '../masters/country/country.model';
import { Port } from '../masters/port/port.model';
import { Partner } from '../masters/partner/partner.model';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import {
  StockCalculationService,
  RawContractPayload,
  RawExecutedShipmentPayload,
} from './services/stock-calculation.service';
import { QueryStockDto } from './dto/query-stock.dto';
import {
  StockCountryGroup,
  StockDashboardSummary,
} from './dto/stock-response.dto';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectModel(PurchaseContract)
    private readonly purchaseContractModel: typeof PurchaseContract,
    @InjectModel(PurchaseContractItem)
    private readonly purchaseContractItemModel: typeof PurchaseContractItem,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(PurchaseContractShipment)
    private readonly shipmentLinkModel: typeof PurchaseContractShipment,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
    @InjectModel(Port)
    private readonly portModel: typeof Port,
    private readonly calculationService: StockCalculationService,
  ) {}

  /**
   * Dashboard API: Returns summary cards aggregated across the stock hierarchy.
   * Single source of truth dynamically calculated from active Purchase Contracts
   * and executed Shipments.
   */
  async getDashboardSummary(
    companyId?: number,
  ): Promise<StockDashboardSummary> {
    const { portCountryMap, countrySet } = await this.loadPortAndCountryMaps();
    const [rawContracts, rawShipments] = await Promise.all([
      this.fetchRawContracts({ companyId, portCountryMap, countrySet }),
      this.fetchExecutedShipments({ companyId, portCountryMap, countrySet }),
    ]);
    const hierarchy = this.calculationService.buildHierarchy(
      rawContracts,
      rawShipments,
    );
    return this.calculationService.calculateDashboardSummary(hierarchy);
  }

  /**
   * Stock List API: Returns hierarchical grouped data:
   * Loading Country -> Product -> Purchase Contracts & Executed Shipments
   * Filters, Search, Sorting, and Pagination handled dynamically.
   */
  async getStockList(
    query: QueryStockDto,
    companyId?: number,
  ): Promise<{ data: StockCountryGroup[]; totalCount: number }> {
    const { portCountryMap, countrySet } = await this.loadPortAndCountryMaps();
    const [rawContracts, rawShipments] = await Promise.all([
      this.fetchRawContracts({ query, companyId, portCountryMap, countrySet }),
      this.fetchExecutedShipments({
        query,
        companyId,
        portCountryMap,
        countrySet,
      }),
    ]);

    // Build the full hierarchical tree with dynamic stock consumption
    const allGroups = this.calculationService.buildHierarchy(
      rawContracts,
      rawShipments,
      query,
    );

    const totalCount = allGroups.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 50);
    const offset = (page - 1) * limit;

    const paginatedData = allGroups.slice(offset, offset + limit);

    return {
      data: paginatedData,
      totalCount,
    };
  }

  /**
   * Validates whether there is sufficient Available Stock for a shipment before execution.
   * If stock is insufficient, throws BadRequestException without modifying any record.
   */
  async validateShipmentStock(
    shipment: SalesContractShipment,
    companyId?: number,
  ): Promise<{
    isValid: boolean;
    availableStock: number;
    requiredStock: number;
    product: string;
    country: string;
  }> {
    let loadedShipment = shipment;
    if (!loadedShipment.salesContract || !loadedShipment.salesContract.items) {
      const found = await this.shipmentModel.findByPk(shipment.id, {
        include: [
          {
            model: SalesContract,
            as: 'salesContract',
            include: [
              {
                model: SalesContractItem,
                as: 'items',
                include: [{ model: Product, as: 'product' }],
              },
            ],
          },
        ],
      });
      if (found) loadedShipment = found;
    }

    const { portCountryMap, countrySet } = await this.loadPortAndCountryMaps();
    const shipmentLinks = await this.fetchShipmentPurchaseContractLinks([
      loadedShipment.id,
    ]);
    const linkedPurchaseContract =
      shipmentLinks.length === 1 ? shipmentLinks[0].purchaseContract : null;
    const resolvedCountry = this.resolveShipmentCountry(
      loadedShipment,
      portCountryMap,
      countrySet,
      linkedPurchaseContract,
    );
    const resolvedProduct = this.resolveShipmentProduct(
      loadedShipment,
      linkedPurchaseContract,
      shipmentLinks.length === 1
        ? shipmentLinks[0].purchaseContractItemId
        : null,
    );

    const effectiveCompanyId =
      companyId ||
      loadedShipment.companyId ||
      loadedShipment.salesContract?.companyId;

    const { data: countryGroups } = await this.getStockList(
      {},
      effectiveCompanyId,
    );

    const countryClean = (resolvedCountry || '').trim().toLowerCase();
    const productClean = (resolvedProduct || '').trim().toLowerCase();

    const matchedCountry = countryGroups.find(
      (cg) => cg.country.trim().toLowerCase() === countryClean,
    );
    const matchedProduct = matchedCountry?.products.find(
      (p) => p.product.trim().toLowerCase() === productClean,
    );

    const availableStock = matchedProduct ? matchedProduct.available : 0;
    const requiredStock = Number(loadedShipment.quantity) || 0;

    if (availableStock < requiredStock) {
      throw new BadRequestException(
        `Insufficient stock: Available Stock for ${resolvedProduct || 'Product'} in ${resolvedCountry || 'Origin'} is ${availableStock} MT, but shipment requires ${requiredStock} MT.`,
      );
    }

    return {
      isValid: true,
      availableStock,
      requiredStock,
      product: resolvedProduct,
      country: resolvedCountry,
    };
  }

  /**
   * Cached lookup maps for ports and countries to avoid multiple DB lookups.
   */
  private async loadPortAndCountryMaps(): Promise<{
    portCountryMap: Map<string, string>;
    countrySet: Map<string, string>;
  }> {
    const ports = await this.portModel.findAll({
      include: [{ model: Country, attributes: ['id', 'name'] }],
      attributes: ['id', 'portName', 'countryId'],
    });
    const portCountryMap = new Map<string, string>();
    for (const p of ports) {
      if (p.portName && p.country?.name) {
        portCountryMap.set(
          p.portName.trim().toLowerCase(),
          p.country.name.trim(),
        );
      }
    }

    const countries = await this.countryModel.findAll({
      attributes: ['id', 'name'],
    });
    const countrySet = new Map<string, string>();
    for (const c of countries) {
      if (c.name) {
        countrySet.set(c.name.trim().toLowerCase(), c.name.trim());
      }
    }

    return { portCountryMap, countrySet };
  }

  /**
   * Fetches Purchase Contracts in a single optimized batch query without N+1.
   * Resolves Loading Country strictly from Place of Loading.
   * Ignores Draft, Cancelled, and Deleted Purchase Contracts.
   */
  private async fetchRawContracts(params: {
    query?: QueryStockDto;
    companyId?: number;
    portCountryMap?: Map<string, string>;
    countrySet?: Map<string, string>;
  }): Promise<RawContractPayload[]> {
    const { query, companyId } = params;

    let portCountryMap = params.portCountryMap;
    let countrySet = params.countrySet;
    if (!portCountryMap || !countrySet) {
      const maps = await this.loadPortAndCountryMaps();
      portCountryMap = maps.portCountryMap;
      countrySet = maps.countrySet;
    }

    // 1. Base Where Clause for Purchase Contracts
    const whereClause: any = {};

    // Multi-tenant isolation
    if (companyId) {
      whereClause.companyId = companyId;
    }

    // Business Rule:
    // Only Active Purchase Contracts contribute to stock.
    // Draft, Cancelled, Rejected must be ignored.
    const defaultExcludedStatuses = ['Draft', 'Cancelled', 'Rejected'];

    if (query?.status && query.status.trim() !== '') {
      const qStatus = query.status.trim();
      if (qStatus.toUpperCase() === 'ACTIVE') {
        whereClause.status = { [Op.notIn]: defaultExcludedStatuses };
      } else {
        whereClause.status = { [Op.iLike]: qStatus };
      }
    } else {
      whereClause.status = { [Op.notIn]: defaultExcludedStatuses };
    }

    // 2. Batch Query: Purchase Contracts with eager associations
    const contracts = await this.purchaseContractModel.findAll({
      where: whereClause,
      include: [
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: Partner,
          as: 'seller',
          attributes: ['id', 'entityName'],
          required: false,
        },
        {
          model: Partner,
          as: 'buyer',
          attributes: ['id', 'entityName'],
          required: false,
        },
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          attributes: [
            'id',
            'contractNumber',
            'financialYear',
            'buyerId',
            'currencyCode',
          ],
          include: [
            {
              model: Partner,
              as: 'buyer',
              attributes: ['id', 'entityName'],
              required: false,
            },
            {
              model: SalesContractItem,
              as: 'items',
              required: false,
              attributes: ['id', 'quantity'],
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['id', 'name'],
                  required: false,
                },
              ],
            },
          ],
        },
        {
          model: PurchaseContractItem,
          as: 'items',
          required: false,
          attributes: [
            'id',
            'productId',
            'productName',
            'quantity',
            'productQuality',
            'packing',
            'bagType',
            'bagSpec',
            'ratePerMt',
            'totalAmount',
          ],
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name'],
              required: false,
            },
          ],
        },
      ],
      order: [['id', 'DESC']],
    });

    const rawPayloads: RawContractPayload[] = [];

    for (const pc of contracts) {
      // ─── Resolve Loading Country ──────────────────────────────────────────────
      // Rule: Country must always come from Purchase Contract -> Place of Loading -> Country.
      // Never use Seller Country. Never use Buyer Country. Never use Warehouse Country.
      let resolvedCountry: string | null = null;

      if (pc.loadingCountry && pc.loadingCountry.trim() !== '') {
        resolvedCountry = pc.loadingCountry.trim();
      } else if (pc.placeOfLoading && pc.placeOfLoading.trim() !== '') {
        const polClean = pc.placeOfLoading.trim().toLowerCase();
        if (portCountryMap.has(polClean)) {
          resolvedCountry = portCountryMap.get(polClean)!;
        } else if (countrySet.has(polClean)) {
          resolvedCountry = countrySet.get(polClean)!;
        }
      }

      // Validation: Country must exist.
      if (!resolvedCountry) {
        continue;
      }

      // Check country filter
      if (query?.country && query.country.trim() !== '') {
        const qCountry = query.country.trim().toLowerCase();
        if (!resolvedCountry.toLowerCase().includes(qCountry)) {
          continue;
        }
      }

      // Check supplier filter
      const supplierName = pc.seller?.entityName || '';
      if (query?.supplier && query.supplier.trim() !== '') {
        const qSup = query.supplier.trim().toLowerCase();
        if (
          !supplierName.toLowerCase().includes(qSup) &&
          String(pc.sellerId) !== query.supplier.trim()
        ) {
          continue;
        }
      }

      // Check buyer filter
      const buyerName =
        pc.buyer?.entityName || pc.salesContract?.buyer?.entityName || '';
      if (query?.buyer && query.buyer.trim() !== '') {
        const qBuyer = query.buyer.trim().toLowerCase();
        if (
          !buyerName.toLowerCase().includes(qBuyer) &&
          String(pc.buyerId) !== query.buyer.trim()
        ) {
          continue;
        }
      }

      // Check cropYear filter
      const cropYear =
        (pc as any).cropYear ||
        (pc as any).financialYear ||
        pc.salesContract?.financialYear ||
        '';
      if (query?.cropYear && query.cropYear.trim() !== '') {
        const qCrop = query.cropYear.trim().toLowerCase();
        if (!cropYear.toLowerCase().includes(qCrop)) {
          continue;
        }
      }

      // Check incoterm filter
      const incoterm = (pc as any).incoterm || '';
      if (query?.incoterm && query.incoterm.trim() !== '') {
        const qInco = query.incoterm.trim().toLowerCase();
        if (!incoterm.toLowerCase().includes(qInco)) {
          continue;
        }
      }

      // Check packing filter
      const contractPacking = (pc as any).packing || '';
      if (query?.packing && query.packing.trim() !== '') {
        const qPack = query.packing.trim().toLowerCase();
        const hasMatchingPacking =
          contractPacking.toLowerCase().includes(qPack) ||
          pc.items?.some((it) =>
            (it.packing || it.bagSpec || it.bagType || '')
              .toLowerCase()
              .includes(qPack),
          );
        if (!hasMatchingPacking) {
          continue;
        }
      }

      const contractNo =
        pc.contractNumber ||
        (pc.salesContract
          ? `PC-${pc.salesContract.contractNumber}`
          : `PC-${pc.id}`);
      const businessRef = pc.businessTransaction?.businessReference || '';

      // ─── Resolve Products for this Purchase Contract ──────────────────────────
      // Items on Purchase Contract take priority, then sales contract items
      let pcItems: Array<{
        productId: number | null;
        productName: string;
        quantity: number;
        price: number;
        packing?: string;
      }> = [];

      if (Array.isArray(pc.items) && pc.items.length > 0) {
        pcItems = pc.items.map((it) => ({
          productId: it.productId || it.product?.id || null,
          productName: (it.product?.name || it.productName || '').trim(),
          quantity: Number(it.quantity) || 0,
          price: Number(it.ratePerMt) || 0,
          packing: it.packing || it.bagSpec || it.bagType || contractPacking,
        }));
      } else if (pc.salesContract?.items && pc.salesContract.items.length > 0) {
        pcItems = pc.salesContract.items.map((scIt) => ({
          productId: scIt.product?.id || null,
          productName: (scIt.product?.name || '').trim(),
          quantity: Number(scIt.quantity) || 0,
          price: Number(pc.items?.[0]?.ratePerMt) || 0,
          packing: contractPacking,
        }));
      } else {
        const fallbackProductName = (pc.productQuality || '').trim();
        const fallbackQty = parseFloat((pc as any).quantity) || 0;
        if (fallbackProductName) {
          pcItems = [
            {
              productId: null,
              productName: fallbackProductName,
              quantity: fallbackQty,
              price: Number((pc as any).ratePerMt) || 0,
              packing: contractPacking,
            },
          ];
        }
      }

      // Filter items to valid products
      const validItems = pcItems.filter((it) => it.productName.length > 0);

      // Validation: Product must exist
      if (validItems.length === 0) {
        continue;
      }

      // Search matching logic:
      // Product, Contract No, Supplier, Buyer, Business Ref No
      const qSearch = (query?.search || '').trim().toLowerCase();
      const matchesSearch = (prodName: string): boolean => {
        if (!qSearch) return true;
        if (prodName.toLowerCase().includes(qSearch)) return true;
        if (resolvedCountry.toLowerCase().includes(qSearch)) return true;
        if (contractNo.toLowerCase().includes(qSearch)) return true;
        if (supplierName.toLowerCase().includes(qSearch)) return true;
        if (buyerName.toLowerCase().includes(qSearch)) return true;
        if (businessRef.toLowerCase().includes(qSearch)) return true;
        return false;
      };

      // Check product filter
      const qProduct = (query?.product || '').trim().toLowerCase();
      const matchesProductFilter = (
        prodName: string,
        pId: number | null,
      ): boolean => {
        if (!qProduct) return true;
        if (prodName.toLowerCase().includes(qProduct)) return true;
        if (pId && String(pId) === qProduct) return true;
        return false;
      };

      // Create payload per product item
      for (const item of validItems) {
        if (!matchesProductFilter(item.productName, item.productId)) {
          continue;
        }
        if (!matchesSearch(item.productName)) {
          continue;
        }

        rawPayloads.push({
          contractId: pc.id,
          contractNo,
          supplier: supplierName,
          supplierId: pc.sellerId,
          buyer: buyerName,
          buyerId: pc.buyerId,
          country: resolvedCountry,
          product: item.productName,
          productId: item.productId,
          purchaseQty: item.quantity,
          price: item.price,
          currency: pc.currencyCode || pc.salesContract?.currencyCode || '',
          status: pc.status,
          cropYear,
          packing: item.packing,
          incoterm,
          businessReference: businessRef,
          contractDate: pc.purchaseDate || pc.createdAt,
        });
      }
    }

    return rawPayloads;
  }

  /**
   * Fetches Executed Shipments to dynamically deduct (consume) stock.
   * Shipments in status: Executed, Stuffed, Dispatched, Completed.
   */
  private async fetchExecutedShipments(params: {
    query?: QueryStockDto;
    companyId?: number;
    portCountryMap: Map<string, string>;
    countrySet: Map<string, string>;
  }): Promise<RawExecutedShipmentPayload[]> {
    const { query, companyId, portCountryMap, countrySet } = params;

    const whereClause = {
      status: { [Op.in]: ['Executed', 'Stuffed', 'Dispatched', 'Completed'] },
      ...(companyId
        ? {
            [Op.or]: [
              { companyId },
              {
                companyId: null,
                [Op.and]: where(
                  col('salesContract.company_id'),
                  companyId,
                ),
              },
            ],
          }
        : {}),
    };

    const shipments = await this.shipmentModel.findAll({
      where: whereClause,
      include: [
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          include: [
            {
              model: Partner,
              as: 'buyer',
              attributes: ['id', 'entityName'],
              required: false,
            },
            {
              model: Partner,
              as: 'seller',
              attributes: ['id', 'entityName'],
              required: false,
            },
            {
              model: SalesContractItem,
              as: 'items',
              required: false,
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['id', 'name'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
      order: [['id', 'DESC']],
    });

    const shipmentLinks = await this.fetchShipmentPurchaseContractLinks(
      shipments.map((shipment) => shipment.id),
    );
    const shipmentLinksById = new Map<number, typeof shipmentLinks>();
    for (const link of shipmentLinks) {
      const links = shipmentLinksById.get(link.shipmentId) || [];
      links.push(link);
      shipmentLinksById.set(link.shipmentId, links);
    }

    const rawPayloads: RawExecutedShipmentPayload[] = [];

    for (const sh of shipments) {
      const links = shipmentLinksById.get(sh.id) || [];
      const canUseAllocationLinks =
        links.length === 1 ||
        (links.length > 1 &&
          links.every((link) => link.allocatedQuantity != null));
      const sourceLinks = canUseAllocationLinks ? links : [];
      const stockSources = sourceLinks.length
        ? sourceLinks
        : [
            {
              purchaseContract: null,
              purchaseContractId: null,
              purchaseContractItemId: null,
              allocatedQuantity: null,
            },
          ];

      // Check country filter
      const buyerName = sh.salesContract?.buyer?.entityName || '';
      if (query?.buyer && query.buyer.trim() !== '') {
        const qBuyer = query.buyer.trim().toLowerCase();
        if (!buyerName.toLowerCase().includes(qBuyer)) {
          continue;
        }
      }

      const supplierName = sh.salesContract?.seller?.entityName || '';
      if (query?.supplier && query.supplier.trim() !== '') {
        const qSup = query.supplier.trim().toLowerCase();
        if (!supplierName.toLowerCase().includes(qSup)) {
          continue;
        }
      }

      const contractNo = sh.salesContract?.contractNumber || '';
      const shipmentRef =
        sh.shipmentReference ||
        (sh.shipmentNo ? `Shipment #${sh.shipmentNo}` : `SH-${sh.id}`);
      const businessRef =
        sh.businessTransaction?.businessReference ||
        sh.salesContract?.businessTransaction?.businessReference ||
        '';

      for (const link of stockSources) {
        const purchaseContract = link.purchaseContract;
        const resolvedCountry = this.resolveShipmentCountry(
          sh,
          portCountryMap,
          countrySet,
          purchaseContract,
        );
        if (!resolvedCountry || resolvedCountry === 'Unknown') {
          continue;
        }

        if (query?.country?.trim() &&
          !resolvedCountry.toLowerCase().includes(query.country.trim().toLowerCase())) {
          continue;
        }

        const resolvedProduct = this.resolveShipmentProduct(
          sh,
          purchaseContract,
          link.purchaseContractItemId,
        );
        const linkedItem = purchaseContract?.items?.find(
          (item) => item.id === link.purchaseContractItemId,
        );
        const productId =
          linkedItem?.productId ||
          linkedItem?.product?.id ||
          sh.salesContract?.items?.[0]?.productId ||
          sh.salesContract?.items?.[0]?.product?.id ||
          null;
        if (!resolvedProduct) continue;

        const qProd = query?.product?.trim().toLowerCase();
        if (
          qProd &&
          !resolvedProduct.toLowerCase().includes(qProd) &&
          String(productId) !== query.product.trim()
        ) {
          continue;
        }

        const qSearch = (query?.search || '').trim().toLowerCase();
        if (
          qSearch &&
          ![
            resolvedProduct,
            resolvedCountry,
            contractNo,
            shipmentRef,
            buyerName,
            supplierName,
            businessRef,
          ].some((value) => value.toLowerCase().includes(qSearch))
        ) {
          continue;
        }

        rawPayloads.push({
          shipmentId: sh.id,
          shipmentNo: sh.shipmentNo || 1,
          shipmentReference: shipmentRef,
          salesContractId: sh.salesContractId,
          salesContractNo: contractNo,
          purchaseContractId: purchaseContract?.id || undefined,
          purchaseContractNo: purchaseContract?.contractNumber || undefined,
          buyer: buyerName,
          buyerId: sh.salesContract?.buyerId,
          supplier: supplierName,
          country: resolvedCountry,
          product: resolvedProduct,
          productId,
          executedQty:
            link.allocatedQuantity != null
              ? Number(link.allocatedQuantity) || 0
              : Number(sh.quantity) || 0,
          executionDate: sh.updatedAt || sh.shipmentDate || sh.createdAt,
          status: sh.status,
          businessReference: businessRef,
          remarks: sh.remarks,
        });
      }
    }

    return rawPayloads;
  }

  private resolveShipmentCountry(
    shipment: SalesContractShipment,
    portCountryMap: Map<string, string>,
    countrySet: Map<string, string>,
    purchaseContract?: PurchaseContract | null,
  ): string {
    const sc = shipment.salesContract;
    const purchaseCountry = purchaseContract?.loadingCountry?.trim();
    if (purchaseCountry) {
      const normalizedCountry = countrySet.get(purchaseCountry.toLowerCase());
      return normalizedCountry || purchaseCountry;
    }

    const purchaseLoadingPlace = purchaseContract?.placeOfLoading?.trim();
    if (purchaseLoadingPlace) {
      const clean = purchaseLoadingPlace.toLowerCase();
      if (portCountryMap.has(clean)) return portCountryMap.get(clean)!;
      if (countrySet.has(clean)) return countrySet.get(clean)!;
    }

    const candidatePlaces = [
      sc?.originCountry,
      sc?.portOfLoading,
      shipment.origin,
      sc?.originLocationName,
    ];

    for (const place of candidatePlaces) {
      if (place && place.trim() !== '') {
        const clean = place.trim().toLowerCase();
        if (countrySet.has(clean)) {
          return countrySet.get(clean)!;
        }
        if (portCountryMap.has(clean)) {
          return portCountryMap.get(clean)!;
        }
      }
    }

    // Secondary fallback: if originCountry is set directly on SC and not in standard countrySet
    if (sc?.originCountry && sc.originCountry.trim() !== '') {
      const trimmed = sc.originCountry.trim();
      const lower = trimmed.toLowerCase();
      if (lower !== 'unknown' && lower !== 'null' && lower !== 'yash') {
        return trimmed;
      }
    }

    return 'Unknown';
  }

  private resolveShipmentProduct(
    shipment: SalesContractShipment,
    purchaseContract?: PurchaseContract | null,
    purchaseContractItemId?: number | null,
  ): string {
    const purchaseItems = purchaseContract?.items || [];
    const matchingPurchaseItem = purchaseItems.find(
      (item) => item.id === purchaseContractItemId,
    );
    const purchaseItem =
      matchingPurchaseItem || (purchaseItems.length === 1 ? purchaseItems[0] : null);
    const purchaseProductName = (
      purchaseItem?.product?.name ||
      purchaseItem?.productName ||
      purchaseItem?.productQuality ||
      ''
    ).trim();
    if (purchaseProductName) return purchaseProductName;

    const sc = shipment.salesContract;
    const items = sc?.items;
    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const name = (it.product?.name || (it as any).productName || '').trim();
        if (name) return name;
      }
    }
    return 'Agri Commodity';
  }

  private async fetchShipmentPurchaseContractLinks(
    shipmentIds: number[],
  ): Promise<PurchaseContractShipment[]> {
    if (shipmentIds.length === 0) return [];

    return this.shipmentLinkModel.findAll({
      where: { shipmentId: { [Op.in]: shipmentIds } },
      include: [
        {
          model: PurchaseContract,
          as: 'purchaseContract',
          required: false,
          include: [
            {
              model: PurchaseContractItem,
              as: 'items',
              required: false,
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['id', 'name'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
    });
  }
}
