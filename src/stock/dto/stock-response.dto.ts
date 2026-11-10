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

export interface StockMovementItem {
  id: string | number;
  date: string | Date;
  movement: string;
  movementType?: string;
  type: 'IN' | 'OUT';
  reference: string;
  party: string;
  supplier?: string | null;
  buyer?: string | null;
  product: string;
  in: number;
  out: number;
  balance: number;
  user?: string | null;
  remarks?: string | null;
  contractId?: number;
  shipmentId?: number;
}

export interface StockProductNode {
  product: string;
  productId?: number | null;
  purchased: number;
  executed: number;
  available: number;
  amountByCurrency: StockAmountByCurrency;
  contractCount: number;
  contracts: StockContractItem[];
  movements?: StockMovementItem[];
}

export interface StockCountryGroup {
  country: string;
  totalPurchased: number;
  totalExecuted: number;
  totalAvailable: number;
  amountByCurrency: StockAmountByCurrency;
  products: StockProductNode[];
}

export interface StockDashboardSummary {
  totalCountries: number;
  totalProducts: number;
  totalPurchaseContracts: number;
  totalPurchasedMT: number;
  totalExecutedMT: number;
  totalAvailableMT: number;
  totalAmountByCurrency: StockAmountByCurrency;
}
