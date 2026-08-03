import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/sequelize';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';
import { ModuleResource } from '../../system/models/module-resource.model';
import { ResourceAction } from '../../system/models/resource-action.model';
import { Role } from '../models/role.model';
import { RoleActionPermission } from '../models/role-action-permission.model';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { Client } from '../../clients/models/client.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';
import { ClientModuleAccess } from '../../clients/models/client-module-access.model';

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
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    @InjectModel(ClientActionAccess)
    private readonly clientActionAccessModel: typeof ClientActionAccess,
    @InjectModel(ClientModuleAccess)
    private readonly clientModuleAccessModel: typeof ClientModuleAccess,
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

    this.logger.log(
      `Discovered ${discoveredPermissions.size} permissions from controllers.`,
    );
    await this.syncPermissions(Array.from(discoveredPermissions));
  }

  private async syncPermissions(permissions: string[]) {
    // Determine admin and client admin roles
    const adminRole = await this.roleModel.findOne({
      where: { name: 'Admin', clientId: null },
    });
    const clientAdminRole = await this.roleModel.findOne({
      where: { name: 'Client Admin', clientId: null },
    });

    const clients = await this.clientModel.findAll();

    for (const permKey of permissions) {
      // Split into resource and action (e.g. 'inventory:create')
      let [resourceName, actionName] = permKey.split(':');
      if (!resourceName || !actionName) continue;

      actionName = actionName.toUpperCase(); // e.g. create -> CREATE

      // Normalize resourceName
      if (resourceName === 'sales-contract' || resourceName === 'sales_contracts') {
        resourceName = 'sales_contract';
      }
      if (resourceName === 'follow-up' || resourceName === 'follow_ups') {
        resourceName = 'follow_up';
      }

      let moduleName = resourceName
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Map to desired frontend matrix modules
      if (resourceName === 'sales_contract') moduleName = 'Sales Contract';
      else if (resourceName === 'follow_up') moduleName = 'Follow Up';
      else if (resourceName === 'hrpolicy') moduleName = 'HR Policy';
      else if (resourceName === 'leave_requests' || resourceName === 'leave')
        moduleName = 'Leaves';
      else if (resourceName === 'leave_types') moduleName = 'Leave Types';
      else if (resourceName.startsWith('employee_')) moduleName = 'Employees';
      else if (resourceName.startsWith('attendance_'))
        moduleName = 'Attendance';

      const isSystemLevel =
        ['clients', 'subscriptions', 'system'].includes(resourceName) ||
        resourceName.startsWith('system');

      const [sysModule] = await this.appModuleModel.findOrCreate({
        where: { name: moduleName },
        defaults: {
          name: moduleName,
          sort_order: isSystemLevel ? 99 : 10,
        } as any,
      });
      const targetModuleId = sysModule.id;

      // Ensure all clients have access to this module
      for (const client of clients) {
        await this.clientModuleAccessModel.findOrCreate({
          where: { client_id: client.id, module_id: targetModuleId },
          defaults: {
            client_id: client.id,
            module_id: targetModuleId,
          } as any,
        });
      }

      const [resource, created] = await this.moduleResourceModel.findOrCreate({
        where: { name: resourceName },
        defaults: {
          name: resourceName,
          display_name: resourceName,
          module_id: targetModuleId,
          sort_order: 0,
        } as any,
      });

      // Update module_id if resource was stuck in Uncategorized or moved
      if (!created && resource.module_id !== targetModuleId) {
        resource.module_id = targetModuleId;
        await resource.save();
      }

      const [action] = await this.resourceActionModel.findOrCreate({
        where: { name: actionName, resource_id: resource.id },
        defaults: {
          name: actionName,
          display_name: actionName,
          resource_id: resource.id,
          sort_order: 0,
        } as any,
      });

      // Ensure all clients have access to this action to prevent 403 errors on assignment
      for (const client of clients) {
        await this.clientActionAccessModel.findOrCreate({
          where: { client_id: client.id, resource_action_id: action.id },
          defaults: {
            client_id: client.id,
            resource_action_id: action.id,
          } as any,
        });
      }

      // System level permissions logic already evaluated as isSystemLevel

      // Assign to Admin role
      if (adminRole) {
        await this.roleActionPermissionModel.findOrCreate({
          where: { role_id: adminRole.id, resource_action_id: action.id },
          defaults: {
            role_id: adminRole.id,
            resource_action_id: action.id,
          } as any,
        });
      }

      // Assign to Client Admin role if not system level
      if (clientAdminRole && !isSystemLevel) {
        await this.roleActionPermissionModel.findOrCreate({
          where: { role_id: clientAdminRole.id, resource_action_id: action.id },
          defaults: {
            role_id: clientAdminRole.id,
            resource_action_id: action.id,
          } as any,
        });
      }
    }

    this.logger.log(
      'Permission discovery and sync (v2) completed successfully.',
    );
  }
}
