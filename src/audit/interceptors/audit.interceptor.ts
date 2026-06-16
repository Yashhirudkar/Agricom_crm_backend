import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../services/audit.service';
import { AUDIT_LOG_KEY, AuditLogOptions } from '../decorators/audit-log.decorator';
import { AuditContext } from '../audit.context';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMeta = this.reflector.getAllAndOverride<AuditLogOptions>(AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!auditMeta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method;
    
    // Infer action from HTTP method
    let action = auditMeta.action;
    if (!action) {
      if (method === 'POST') action = 'CREATE';
      else if (method === 'PUT' || method === 'PATCH') action = 'UPDATE';
      else if (method === 'DELETE') action = 'DELETE';
      else action = 'READ';
    }

    // Usually we do not want to audit READ operations to avoid database bloat
    if (action === 'READ') return next.handle();

    return next.handle().pipe(
      tap({
        next: (responseBody: any) => {
          const store = AuditContext.getStore();
          // We only log if we have a valid store and userId
          if (store && store.userId) {
            this.auditService.writeLog({
              clientId: store.clientId || null,
              companyId: store.companyId || null,
              userId: store.userId,
              entityType: auditMeta.entityType,
              entityId: responseBody?.id || Number(request.params?.id) || null,
              action: action!,
              newValue: (action === 'CREATE' || action === 'UPDATE') ? responseBody : null,
              ipAddress: store.ipAddress,
              userAgent: store.userAgent,
            }).catch(err => {
              console.error('[AuditInterceptor] Failed to write audit log:', err);
            });
          }
        },
      }),
    );
  }
}
