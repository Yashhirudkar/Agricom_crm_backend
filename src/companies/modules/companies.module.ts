import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CompaniesController } from '../controllers/companies.controller';
import { CompaniesService } from '../services/companies.service';
import { Company } from '../models/company.model';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Company]),
    RbacModule,
    AuditModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
