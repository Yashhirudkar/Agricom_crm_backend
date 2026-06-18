import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Client } from '../models/client.model';
import { ClientsService } from '../services/clients.service';
import { ClientsController } from '../controllers/clients.controller';
import { Company } from '../../companies/models/company.model';
import { User } from '../../users/models/user.model';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { AuditModule } from '../../audit/modules/audit.module';
import { SystemModule } from '../../system/modules/system.module';
import { ClientFolderAccess } from '../models/client-folder-access.model';
import { ClientItemAccess } from '../models/client-item-access.model';
import { ClientModuleAccess } from '../models/client-module-access.model';
import { ClientActionAccess } from '../models/client-action-access.model';
import { ClientsAccessService } from '../services/clients-access.service';
import { ClientsAccessController } from '../controllers/clients-access.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Client, Company, User, ClientFolderAccess, ClientItemAccess, ClientModuleAccess, ClientActionAccess]),
    RbacModule,
    AuditModule,
    SystemModule,
  ],
  providers: [ClientsService, ClientsAccessService],
  controllers: [ClientsController, ClientsAccessController],
  exports: [ClientsService, ClientsAccessService],
})
export class ClientsModule {}
