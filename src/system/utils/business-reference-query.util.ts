import { BusinessTransaction } from '../models/business-transaction.model';

const BUSINESS_REFERENCE_PATTERN = /^REF-\d{6,}$/i;

export function isBusinessReferenceSearch(value?: string): boolean {
  return typeof value === 'string' && BUSINESS_REFERENCE_PATTERN.test(value.trim());
}

export async function resolveBusinessTransactionId(
  reference?: string,
  companyId?: number,
): Promise<number | null> {
  if (!reference?.trim()) return null;

  const where: Record<string, unknown> = {
    businessReference: reference.trim().toUpperCase(),
  };
  if (companyId !== undefined && companyId !== null) {
    where.companyId = companyId;
  }

  const transaction = await BusinessTransaction.findOne({
    where,
    attributes: ['id'],
  });
  return transaction ? Number(transaction.id) : -1;
}

export function mapBusinessReference<T extends Record<string, any>>(
  record: T,
): T & { businessReference: string | null } {
  const businessTransaction =
    record.businessTransaction ??
    record.get?.('businessTransaction') ??
    null;
  return {
    ...record,
    businessReference: businessTransaction?.businessReference ?? null,
  };
}
