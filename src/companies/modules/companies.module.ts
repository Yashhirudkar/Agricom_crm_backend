import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CompaniesController } from '../controllers/companies.controller';
import { CompaniesService } from '../services/companies.service';
import { Company } from '../models/company.model';
import { CompanyHrPolicy } from '../models/company-hr-policy.model';
import { CompanyHrPoliciesService } from '../services/company-hr-policies.service';
import { CompanyHrPoliciesController } from '../controllers/company-hr-policies.controller';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Company, CompanyHrPolicy]),
    RbacModule,
    AuditModule,
  ],
  controllers: [CompaniesController, CompanyHrPoliciesController],
  providers: [CompaniesService, CompanyHrPoliciesService],
  exports: [CompaniesService, CompanyHrPoliciesService],
})
export class CompaniesModule {}
