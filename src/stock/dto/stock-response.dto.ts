export type StockAmountByCurrency = Record<string, number>;

export interface StockContractItem {
  contractId: number;
  contractNo: string;
  supplier: string;
  supplierName?: string;
  buyer?: string;
  buyerName?: string;
  purchaseQty: number;
  price: number;
  currency: string;
  amount: number;
  status: string;
  cropYear?: string;
  packing?: string;
  incoterm?: string;
  businessReference?: string;
  contractDate?: string | Date;
}

export interface StockProductNode {
  product: string;
  productId?: number | null;
  purchased: number;
  amountByCurrency: StockAmountByCurrency;
  contractCount: number;
  contracts: StockContractItem[];
}

export interface StockCountryGroup {
  country: string;
  totalPurchased: number;
  amountByCurrency: StockAmountByCurrency;
  products: StockProductNode[];
}

export interface StockDashboardSummary {
  totalCountries: number;
  totalProducts: number;
  totalPurchaseContracts: number;
  totalPurchasedMT: number;
  totalAmountByCurrency: StockAmountByCurrency;
}
