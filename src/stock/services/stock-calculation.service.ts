import { Injectable } from '@nestjs/common';
import {
  StockCountryGroup,
  StockProductNode,
  StockContractItem,
  StockMovementItem,
  StockDashboardSummary,
  StockAmountByCurrency,
} from '../dto/stock-response.dto';
import { QueryStockDto } from '../dto/query-stock.dto';

export interface RawContractPayload {
  contractId: number;
  contractNo: string;
  supplier: string;
  supplierId?: number;
  buyer?: string;
  buyerId?: number;
  country: string;
  product: string;
  productId?: number | null;
  purchaseQty: number;
  price?: number;
  currency?: string;
  status: string;
  cropYear?: string;
  packing?: string;
  incoterm?: string;
  businessReference?: string;
  contractDate?: string | Date;
}

export interface RawExecutedShipmentPayload {
  shipmentId: number;
  shipmentNo: number;
  shipmentReference: string;
  salesContractId: number;
  salesContractNo?: string;
  purchaseContractId?: number;
  purchaseContractNo?: string;
  buyer: string;
  buyerId?: number;
  supplier?: string;
  country: string;
  product: string;
  productId?: number | null;
  executedQty: number;
  executionDate: string | Date;
  status: string;
  businessReference?: string;
  remarks?: string;
}

@Injectable()
export class StockCalculationService {
  /**
   * Group raw contracts and executed shipments into the hierarchical
   * Country -> Product -> Contracts tree with dynamic stock consumption.
   */
  buildHierarchy(
    rawContracts: RawContractPayload[],
    rawShipmentsOrQuery?: RawExecutedShipmentPayload[] | QueryStockDto,
    query?: QueryStockDto,
  ): StockCountryGroup[] {
    let rawShipments: RawExecutedShipmentPayload[] = [];
    let effectiveQuery: QueryStockDto | undefined = query;

    if (Array.isArray(rawShipmentsOrQuery)) {
      rawShipments = rawShipmentsOrQuery;
    } else if (rawShipmentsOrQuery && typeof rawShipmentsOrQuery === 'object') {
      effectiveQuery = rawShipmentsOrQuery;
    }
    // 1. Group by Country -> Product -> Contracts & Shipments
    const countryMap = new Map<
      string,
      Map<
        string,
        {
          contracts: StockContractItem[];
          shipments: RawExecutedShipmentPayload[];
          productId: number | null;
        }
      >
    >();

    const getOrCreateProductBucket = (
      country: string,
      product: string,
      productId: number | null = null,
    ) => {
      if (!countryMap.has(country)) {
        countryMap.set(country, new Map());
      }
      const prodMap = countryMap.get(country)!;
      if (!prodMap.has(product)) {
        prodMap.set(product, { contracts: [], shipments: [], productId });
      }
      const bucket = prodMap.get(product)!;
      if (productId && !bucket.productId) {
        bucket.productId = productId;
      }
      return bucket;
    };

    // Index purchase contracts (Supply / IN)
    for (const raw of rawContracts) {
      const country = (raw.country || '').trim();
      const product = (raw.product || '').trim();

      if (!country || !product) {
        continue;
      }

      const contractItem: StockContractItem = {
        contractId: raw.contractId,
        contractNo: raw.contractNo,
        supplier: raw.supplier || 'N/A',
        supplierName: raw.supplier || '',
        buyer: raw.buyer,
        buyerName: raw.buyer || '',
        purchaseQty: this.round(Math.max(0, Number(raw.purchaseQty) || 0)),
        price: this.round(Math.max(0, Number(raw.price) || 0)),
        currency: this.normalizeCurrency(raw.currency),
        amount: this.round(
          Math.max(0, Number(raw.purchaseQty) || 0) *
            Math.max(0, Number(raw.price) || 0),
        ),
        status: raw.status,
        cropYear: raw.cropYear,
        packing: raw.packing,
        incoterm: raw.incoterm,
        businessReference: raw.businessReference,
        contractDate: raw.contractDate,
      };

      const bucket = getOrCreateProductBucket(
        country,
        product,
        raw.productId ?? null,
      );
      bucket.contracts.push(contractItem);
    }

    // Index executed shipments (Consumption / OUT)
    for (const sh of rawShipments) {
      const country = (sh.country || '').trim();
      const product = (sh.product || '').trim();

      if (!country || !product) {
        continue;
      }

      const bucket = getOrCreateProductBucket(
        country,
        product,
        sh.productId ?? null,
      );
      bucket.shipments.push(sh);
    }

    // 2. Build the grouped tree with Product & Country aggregations
    const countryGroups: StockCountryGroup[] = [];

    for (const [countryName, prodMap] of countryMap.entries()) {
      const productNodes: StockProductNode[] = [];

      let countryPurchased = 0;
      let countryExecuted = 0;

      for (const [productName, bucket] of prodMap.entries()) {
        const prodPurchased = this.round(
          bucket.contracts.reduce((sum, c) => sum + c.purchaseQty, 0),
        );
        const prodExecuted = this.round(
          bucket.shipments.reduce((sum, s) => sum + s.executedQty, 0),
        );
        const prodAvailable = this.round(
          Math.max(0, prodPurchased - prodExecuted),
        );

        const amountByCurrency = this.aggregateAmounts(bucket.contracts);

        // Generate combined chronological Movement Register for Product Drawer
        const movements: StockMovementItem[] = [];

        // Add IN movements (Approved Purchase Contracts)
        for (const c of bucket.contracts) {
          movements.push({
            id: `PC-${c.contractId}`,
            date: c.contractDate || new Date(),
            movement: 'Purchase Contract Created',
            movementType: 'Purchase Contract Created',
            type: 'IN',
            reference: c.businessReference || c.contractNo,
            party: c.supplier || c.supplierName || '—',
            supplier: c.supplier || c.supplierName || null,
            buyer: c.buyer || c.buyerName || null,
            product: productName,
            in: c.purchaseQty,
            out: 0,
            balance: 0,
            contractId: c.contractId,
          });
        }

        // Add OUT movements (Executed Shipments)
        for (const s of bucket.shipments) {
          movements.push({
            id: `SH-${s.shipmentId}`,
            date: s.executionDate || new Date(),
            movement: 'Shipment Executed',
            movementType: 'Shipment Executed',
            type: 'OUT',
            reference:
              s.businessReference ||
              s.shipmentReference ||
              `Shipment #${s.shipmentNo}`,
            party: s.buyer || '—',
            buyer: s.buyer || null,
            supplier: s.supplier || null,
            product: productName,
            in: 0,
            out: s.executedQty,
            balance: 0,
            shipmentId: s.shipmentId,
            remarks: s.remarks || null,
          });
        }

        // Sort chronologically ascending (oldest first)
        movements.sort((a, b) => {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          return tA - tB;
        });

        // Compute running balance
        let runningBalance = 0;
        for (const m of movements) {
          runningBalance = this.round(runningBalance + m.in - m.out);
          m.balance = runningBalance;
        }

        productNodes.push({
          product: productName,
          productId: bucket.productId,
          purchased: prodPurchased,
          executed: prodExecuted,
          available: prodAvailable,
          contractCount: bucket.contracts.length,
          amountByCurrency,
          contracts: bucket.contracts,
          movements,
        });

        countryPurchased += prodPurchased;
        countryExecuted += prodExecuted;
      }

      const amountByCurrency = this.aggregateAmounts(
        productNodes.flatMap((product) => product.contracts),
      );

      countryGroups.push({
        country: countryName,
        totalPurchased: this.round(countryPurchased),
        totalExecuted: this.round(countryExecuted),
        totalAvailable: this.round(
          Math.max(0, countryPurchased - countryExecuted),
        ),
        amountByCurrency,
        products: productNodes,
      });
    }

    // 3. Apply sorting
    return this.sortHierarchy(countryGroups, effectiveQuery);
  }

  /**
   * Computes the summary cards for the Dashboard API.
   */
  calculateDashboardSummary(
    hierarchy: StockCountryGroup[],
  ): StockDashboardSummary {
    const totalCountries = hierarchy.length;
    const allProducts = new Set<string>();
    let totalPurchaseContracts = 0;
    let totalPurchasedMT = 0;
    let totalExecutedMT = 0;
    let totalAvailableMT = 0;
    const totalAmountByCurrency: StockAmountByCurrency = {};

    for (const country of hierarchy) {
      totalPurchasedMT += country.totalPurchased;
      totalExecutedMT += country.totalExecuted;
      totalAvailableMT += country.totalAvailable;

      for (const prod of country.products) {
        allProducts.add(prod.product.toLowerCase().trim());
        totalPurchaseContracts += prod.contracts.length;
        this.addAmounts(totalAmountByCurrency, prod.amountByCurrency);
      }
    }

    return {
      totalCountries,
      totalProducts: allProducts.size,
      totalPurchaseContracts,
      totalPurchasedMT: this.round(totalPurchasedMT),
      totalExecutedMT: this.round(totalExecutedMT),
      totalAvailableMT: this.round(totalAvailableMT),
      totalAmountByCurrency,
    };
  }

  /**
   * Sorts the hierarchy according to sortBy and sortOrder.
   */
  sortHierarchy(
    groups: StockCountryGroup[],
    query?: QueryStockDto,
  ): StockCountryGroup[] {
    const sortBy = (query?.sortBy || 'country').toLowerCase();
    const isDesc = (query?.sortOrder || 'ASC').toUpperCase() === 'DESC';
    const direction = isDesc ? -1 : 1;

    // Sort products inside each country first
    for (const group of groups) {
      group.products.sort((a, b) => {
        if (sortBy === 'product') {
          return a.product.localeCompare(b.product) * direction;
        }
        if (sortBy === 'purchasedqty' || sortBy === 'purchased') {
          return (a.purchased - b.purchased) * direction;
        }
        if (sortBy === 'available' || sortBy === 'availableqty') {
          return (a.available - b.available) * direction;
        }
        return a.product.localeCompare(b.product);
      });
    }

    // Sort country groups
    groups.sort((a, b) => {
      if (sortBy === 'country') {
        return a.country.localeCompare(b.country) * direction;
      }
      if (sortBy === 'purchasedqty' || sortBy === 'purchased') {
        return (a.totalPurchased - b.totalPurchased) * direction;
      }
      if (sortBy === 'available' || sortBy === 'availableqty') {
        return (a.totalAvailable - b.totalAvailable) * direction;
      }
      if (sortBy === 'newestcontract') {
        const maxContractIdA = this.getMaxContractId(a);
        const maxContractIdB = this.getMaxContractId(b);
        return maxContractIdB - maxContractIdA; // Newest first
      }
      if (sortBy === 'oldestcontract') {
        const minContractIdA = this.getMinContractId(a);
        const minContractIdB = this.getMinContractId(b);
        return minContractIdA - minContractIdB; // Oldest first
      }
      return a.country.localeCompare(b.country) * direction;
    });

    return groups;
  }

  private getMaxContractId(group: StockCountryGroup): number {
    let max = 0;
    for (const p of group.products) {
      for (const c of p.contracts) {
        if (c.contractId > max) max = c.contractId;
      }
    }
    return max;
  }

  private getMinContractId(group: StockCountryGroup): number {
    let min = Number.MAX_SAFE_INTEGER;
    for (const p of group.products) {
      for (const c of p.contracts) {
        if (c.contractId < min) min = c.contractId;
      }
    }
    return min === Number.MAX_SAFE_INTEGER ? 0 : min;
  }

  private round(val: number): number {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  private normalizeCurrency(currency?: string): string {
    return (currency || 'N/A').trim().toUpperCase() || 'N/A';
  }

  private aggregateAmounts(
    contracts: StockContractItem[],
  ): StockAmountByCurrency {
    const amounts: StockAmountByCurrency = {};
    for (const contract of contracts) {
      const currency = this.normalizeCurrency(contract.currency);
      amounts[currency] = this.round(
        (amounts[currency] || 0) + contract.amount,
      );
    }
    return amounts;
  }

  private addAmounts(
    target: StockAmountByCurrency,
    source: StockAmountByCurrency,
  ): void {
    for (const [currency, amount] of Object.entries(source)) {
      target[currency] = this.round((target[currency] || 0) + amount);
    }
  }
}
