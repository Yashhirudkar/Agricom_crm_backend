import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuditContext, AuditContextData } from '../audit.context';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    const store: AuditContextData = {
      ipAddress,
      userAgent,
      // userId, clientId, companyId will be populated later by JwtStrategy/AuthGuard
    };

    AuditContext.run(store, () => {
      next();
    });
  }
}
