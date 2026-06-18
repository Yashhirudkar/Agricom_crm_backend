import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/sequelize';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';
import { ModuleResource } from '../../system/models/module-resource.model';
import { ResourceAction } from '../../system/models/resource-action.model';
import { Role } from '../models/role.model';
import { RoleActionPermission } from '../models/role-action-permission.model';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionDiscoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    @InjectModel(AppModuleModel)
    private readonly appModuleModel: typeof AppModuleModel,
    @InjectModel(ModuleResource)
    private readonly moduleResourceModel: typeof ModuleResource,
    @InjectModel(ResourceAction)
    private readonly resourceActionModel: typeof ResourceAction,
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
    @InjectModel(RoleActionPermission)
    private readonly roleActionPermissionModel: typeof RoleActionPermission,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Starting dynamic permission discovery (v2)...');
    const discoveredPermissions = new Set<string>();

    const controllers = this.discoveryService.getControllers();

    controllers.forEach((wrapper) => {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') return;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      methodNames.forEach((methodName) => {
        const method = instance[methodName];
        if (typeof method !== 'function') return;

        const permissions = this.reflector.get<string[]>(
          PERMISSIONS_KEY,
          method,
        );

        if (permissions && Array.isArray(permissions)) {
          permissions.forEach((p) => discoveredPermissions.add(p));
        }
      });
    });

    this.logger.log(`Discovered ${discoveredPermissions.size} permissions from controllers.`);
    await this.syncPermissions(Array.from(discoveredPermissions));
  }

  private async syncPermissions(permissions: string[]) {
    // Determine admin and client admin roles
    const adminRole = await this.roleModel.findOne({ where: { name: 'Admin', clientId: null } });
    const clientAdminRole = await this.roleModel.findOne({ where: { name: 'Client Admin', clientId: null } });

    // Ensure default Uncategorized AppModule exists
    const [defaultModule] = await this.appModuleModel.findOrCreate({
      where: { name: 'Uncategorized' },
      defaults: { name: 'Uncategorized', sort_order: 999 } as any,
    });

    for (const permKey of permissions) {
      // Split into resource and action (e.g. 'inventory:create')
      let [resourceName, actionName] = permKey.split(':');
      if (!resourceName || !actionName) continue;
      
      actionName = actionName.toUpperCase(); // e.g. create -> CREATE

      const [resource] = await this.moduleResourceModel.findOrCreate({
        where: { name: resourceName },
        defaults: { name: resourceName, display_name: resourceName, module_id: defaultModule.id, sort_order: 0 } as any,
      });

      const [action] = await this.resourceActionModel.findOrCreate({
        where: { name: actionName, resource_id: resource.id },
        defaults: { name: actionName, display_name: actionName, resource_id: resource.id, sort_order: 0 } as any,
      });

      // System level permissions logic
      const isSystemLevel = ['clients', 'subscriptions', 'system'].includes(resourceName) || resourceName.startsWith('system');

      // Assign to Admin role
      if (adminRole) {
        await this.roleActionPermissionModel.findOrCreate({
          where: { role_id: adminRole.id, resource_action_id: action.id },
          defaults: { role_id: adminRole.id, resource_action_id: action.id } as any,
        });
      }

      // Assign to Client Admin role if not system level
      if (clientAdminRole && !isSystemLevel) {
        await this.roleActionPermissionModel.findOrCreate({
          where: { role_id: clientAdminRole.id, resource_action_id: action.id },
          defaults: { role_id: clientAdminRole.id, resource_action_id: action.id } as any,
        });
      }
    }
    
    this.logger.log('Permission discovery and sync (v2) completed successfully.');
  }
}
