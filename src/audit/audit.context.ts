import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContextData {
  userId?: number;
  clientId?: number;
  companyId?: number;
  ipAddress?: string;
  userAgent?: string;
}

export const AuditContext = new AsyncLocalStorage<AuditContextData>();
