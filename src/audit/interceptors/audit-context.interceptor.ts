import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditContext } from '../audit.context';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const store = AuditContext.getStore();

    if (store) {
      if (request.user) {
        store.userId = request.user.userId || request.user.id;
        store.clientId = request.user.clientId;
      }
      // Assuming companyId is passed via header or body
      store.companyId = request.headers['x-company-id'] 
        ? parseInt(request.headers['x-company-id'] as string, 10) 
        : (request.body?.companyId || request.query?.companyId || null);
    }

    return next.handle();
  }
}
