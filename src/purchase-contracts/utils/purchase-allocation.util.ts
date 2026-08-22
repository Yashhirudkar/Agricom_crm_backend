export interface AllocationSummaryInput {
  salesContractQty: number;
  alreadyAllocatedQty: number;
  currentPurchaseQty: number;
}

export interface AllocationSummaryResult {
  salesContractQty: number;
  alreadyAllocatedQty: number;
  availableBalanceQty: number;
  currentPurchaseQty: number;
  remainingBalance: number;
  overAllocatedQty: number;
  isOverAllocated: boolean;
}

/**
 * Enterprise Purchase Allocation Business Logic.
 * Single source of truth for contract allocation calculations.
 */
export function calculatePurchaseAllocation(input: AllocationSummaryInput): AllocationSummaryResult {
  const salesContractQty = Math.max(0, Number(input.salesContractQty) || 0);
  const alreadyAllocatedQty = Math.max(0, Number(input.alreadyAllocatedQty) || 0);
  const currentPurchaseQty = Math.max(0, Number(input.currentPurchaseQty) || 0);

  const rawAvailable = salesContractQty - alreadyAllocatedQty;
  const availableBalanceQty = Math.max(0, rawAvailable);
  const remaining = availableBalanceQty - currentPurchaseQty;

  const isOverAllocated = currentPurchaseQty > availableBalanceQty;
  const overAllocatedQty = isOverAllocated ? currentPurchaseQty - availableBalanceQty : 0;
  const remainingBalance = isOverAllocated ? 0 : Math.max(0, remaining);

  return {
    salesContractQty: parseFloat(salesContractQty.toFixed(4)),
    alreadyAllocatedQty: parseFloat(alreadyAllocatedQty.toFixed(4)),
    availableBalanceQty: parseFloat(availableBalanceQty.toFixed(4)),
    currentPurchaseQty: parseFloat(currentPurchaseQty.toFixed(4)),
    remainingBalance: parseFloat(remainingBalance.toFixed(4)),
    overAllocatedQty: parseFloat(overAllocatedQty.toFixed(4)),
    isOverAllocated,
  };
}
