import { Module, forwardRef } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SequelizeModule } from '@nestjs/sequelize';
import { Role } from '../models/role.model';

import { RoleActionPermission } from '../models/role-action-permission.model';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';
import { ModuleResource } from '../../system/models/module-resource.model';
import { ResourceAction } from '../../system/models/resource-action.model';
import { UserRole } from '../models/user-role.model';
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';
import { Client } from '../../clients/models/client.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';
import { UserCompany } from '../../users/models/user-company.model';
import { RbacService } from '../services/rbac.service';
import { RbacController } from '../controllers/rbac.controller';
import { RbacSeederService } from '../services/rbac-seeder.service';
import { PermissionDiscoveryService } from '../services/permission-discovery.service';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Role, RoleActionPermission, AppModuleModel, ModuleResource, ResourceAction, UserRole, User, Company, Client, UserCompany, ClientActionAccess]),
    DiscoveryModule,
    forwardRef(() => AuditModule),
  ],
  controllers: [RbacController],
  providers: [RbacService, RbacSeederService, PermissionDiscoveryService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard, SequelizeModule],
})
export class RbacModule {}
