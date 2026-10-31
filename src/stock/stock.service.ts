import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../sales-contracts/models/sales-contract-item.model';
import { Product } from '../masters/product/product.model';
import { Country } from '../masters/country/country.model';
import { Port } from '../masters/port/port.model';
import { Partner } from '../masters/partner/partner.model';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import {
  StockCalculationService,
  RawContractPayload,
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
   * Single source of truth dynamically calculated from active Purchase Contracts.
   */
  async getDashboardSummary(
    companyId?: number,
  ): Promise<StockDashboardSummary> {
    const rawContracts = await this.fetchRawContracts({ companyId });
    const hierarchy = this.calculationService.buildHierarchy(rawContracts);
    return this.calculationService.calculateDashboardSummary(hierarchy);
  }

  /**
   * Stock List API: Returns hierarchical grouped data:
   * Loading Country -> Product -> Purchase Contracts
   * Filters, Search, Sorting, and Pagination handled dynamically.
   */
  async getStockList(
    query: QueryStockDto,
    companyId?: number,
  ): Promise<{ data: StockCountryGroup[]; totalCount: number }> {
    const rawContracts = await this.fetchRawContracts({
      query,
      companyId,
    });

    // Build the full hierarchical tree
    const allGroups = this.calculationService.buildHierarchy(
      rawContracts,
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
   * Fetches Purchase Contracts in a single optimized batch query without N+1.
   * Resolves Loading Country strictly from Place of Loading.
   * Ignores Draft, Cancelled, and Deleted Purchase Contracts.
   */
  private async fetchRawContracts(params: {
    query?: QueryStockDto;
    companyId?: number;
  }): Promise<RawContractPayload[]> {
    const { query, companyId } = params;

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

    // 2. Load ports for place of loading resolution if needed
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

    // Load countries lookup for direct matches
    const countries = await this.countryModel.findAll({
      attributes: ['id', 'name'],
    });
    const countrySet = new Map<string, string>();
    for (const c of countries) {
      if (c.name) {
        countrySet.set(c.name.trim().toLowerCase(), c.name.trim());
      }
    }

    // 3. Batch Query: Purchase Contracts with eager associations
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
}
