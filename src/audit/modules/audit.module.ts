import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditLog } from '../models/audit-log.model';
import { AuditService } from '../services/audit.service';
import { AuditController } from '../controllers/audit.controller';
import { RbacModule } from '../../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([AuditLog]),
    RbacModule,
  ],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
