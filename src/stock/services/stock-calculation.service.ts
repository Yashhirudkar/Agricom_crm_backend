import { Injectable } from '@nestjs/common';
import {
  StockCountryGroup,
  StockProductNode,
  StockContractItem,
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

@Injectable()
export class StockCalculationService {
  /**
   * Group raw contracts into the hierarchical Country -> Product -> Contracts tree.
   */
  buildHierarchy(
    rawContracts: RawContractPayload[],
    query?: QueryStockDto,
  ): StockCountryGroup[] {
    // 1. Group by Country -> Product
    const countryMap = new Map<string, Map<string, StockContractItem[]>>();

    for (const raw of rawContracts) {
      const country = (raw.country || '').trim();
      const product = (raw.product || '').trim();

      // Rule: Country must exist. Product must exist.
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

      if (!countryMap.has(country)) {
        countryMap.set(country, new Map());
      }
      const prodMap = countryMap.get(country);

      if (!prodMap.has(product)) {
        prodMap.set(product, []);
      }
      prodMap.get(product).push(contractItem);
    }

    // 2. Build the grouped tree with Product & Country aggregations
    const countryGroups: StockCountryGroup[] = [];

    for (const [countryName, prodMap] of countryMap.entries()) {
      const productNodes: StockProductNode[] = [];

      let countryPurchased = 0;

      for (const [productName, contracts] of prodMap.entries()) {
        const prodPurchased = this.round(
          contracts.reduce((sum, c) => sum + c.purchaseQty, 0),
        );

        const amountByCurrency = this.aggregateAmounts(contracts);
        productNodes.push({
          product: productName,
          purchased: prodPurchased,
          contractCount: contracts.length,
          amountByCurrency,
          contracts,
        });

        countryPurchased += prodPurchased;
      }

      const amountByCurrency = this.aggregateAmounts(
        productNodes.flatMap((product) => product.contracts),
      );
      countryGroups.push({
        country: countryName,
        totalPurchased: this.round(countryPurchased),
        amountByCurrency,
        products: productNodes,
      });
    }

    // 3. Apply sorting
    return this.sortHierarchy(countryGroups, query);
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
    const totalAmountByCurrency: StockAmountByCurrency = {};

    for (const country of hierarchy) {
      totalPurchasedMT += country.totalPurchased;

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
