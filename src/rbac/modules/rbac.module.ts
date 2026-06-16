import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { Permission } from '../models/permission.model';
import { RolePermission } from '../models/role-permission.model';
import { UserRole } from '../models/user-role.model';
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';
import { Client } from '../../clients/models/client.model';
import { UserCompany } from '../../users/models/user-company.model';
import { RbacService } from '../services/rbac.service';
import { RbacController } from '../controllers/rbac.controller';
import { RbacSeederService } from '../services/rbac-seeder.service';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Role, Permission, RolePermission, UserRole, User, Company, Client, UserCompany]),
    forwardRef(() => AuditModule),
  ],
  controllers: [RbacController],
  providers: [RbacService, RbacSeederService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard, SequelizeModule],
})
export class RbacModule {}
