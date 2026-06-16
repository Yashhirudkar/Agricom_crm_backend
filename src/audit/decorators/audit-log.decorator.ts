import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export interface AuditLogOptions {
  entityType: string;
  action?: string; // Optional: If not provided, it can be inferred from HTTP method
}

export const AuditLog = (options: string | AuditLogOptions) => {
  const metadata = typeof options === 'string' ? { entityType: options } : options;
  return SetMetadata(AUDIT_LOG_KEY, metadata);
};
