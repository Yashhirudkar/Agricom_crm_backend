import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { SystemController } from '../controllers/system.controller';
import { SystemService } from '../services/system.service';
import { SidebarService } from '../services/sidebar.service';
import { MatrixBuilderService } from '../services/matrix-builder.service';
import { SystemAuditService } from '../services/system-audit.service';
import { SidebarSeederService } from '../services/sidebar-seeder.service';
import { SidebarController } from '../controllers/sidebar.controller';
import { MatrixBuilderController } from '../controllers/matrix-builder.controller';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { SidebarFolder } from '../models/sidebar-folder.model';
import { SidebarItem } from '../models/sidebar-item.model';
import { SystemAuditLog } from '../models/system-audit-log.model';
import { AppModule as AppModuleModel } from '../models/app-module.model';
import { ModuleResource } from '../models/module-resource.model';
import { ResourceAction } from '../models/resource-action.model';
import { ClientFolderAccess } from '../../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../../clients/models/client-item-access.model';
import { OptionsController } from '../controllers/options.controller';
import { OptionsService } from '../services/options.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SidebarFolder,
      SidebarItem,
      SystemAuditLog,
      AppModuleModel,
      ModuleResource,
      ResourceAction,
      ClientFolderAccess,
      ClientItemAccess,
    ]),
    RbacModule,
  ],
  controllers: [
    SystemController,
    SidebarController,
    MatrixBuilderController,
    OptionsController,
  ],
  providers: [
    SystemService,
    SidebarService,
    MatrixBuilderService,
    SystemAuditService,
    SidebarSeederService,
    OptionsService,
  ],
  exports: [
    SystemService,
    SidebarService,
    MatrixBuilderService,
    SystemAuditService,
    OptionsService,
  ],
})
export class SystemModule {}
