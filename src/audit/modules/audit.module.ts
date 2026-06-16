import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditLog } from '../models/audit-log.model';
import { AuditService } from '../services/audit.service';
import { AuditController } from '../controllers/audit.controller';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { AuditContextInterceptor } from '../interceptors/audit-context.interceptor';

@Module({
  imports: [
    SequelizeModule.forFeature([AuditLog]),
    forwardRef(() => RbacModule),
  ],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
