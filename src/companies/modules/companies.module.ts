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

import { AuditLog } from '../../audit/models/audit-log.model';
import { User } from '../../users/models/user.model';
import { AttendanceRecord } from '../../attendance/models/attendance-record.model';
import { AttendancePolicyEngineService } from '../../attendance/services/attendance-policy-engine.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Company, CompanyHrPolicy, AuditLog, User, AttendanceRecord]),
    RbacModule,
    AuditModule,
  ],
  controllers: [CompaniesController, CompanyHrPoliciesController],
  providers: [CompaniesService, CompanyHrPoliciesService, AttendancePolicyEngineService],
  exports: [CompaniesService, CompanyHrPoliciesService, AttendancePolicyEngineService],
})
export class CompaniesModule {}
