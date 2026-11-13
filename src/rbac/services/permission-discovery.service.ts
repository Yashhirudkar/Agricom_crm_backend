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
import { measureStartupStep } from '../../common/startup-timing';
import { Op } from 'sequelize';

interface DiscoveredPermission {
  resourceName: string;
  actionName: string;
  moduleName: string;
  isSystemLevel: boolean;
}

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

    // Extra permissions used in service-layer logic (not tied to a specific endpoint)
    // These must be registered so they appear in the permission matrix UI
    const extraPermissions = [
      'follow_up:view_all',
      'follow_up:read_all',
      'follow_up:update_all',
      'shipments:create',
      'shipments:delete',
      'shipments:force_delete',
      'shipments:export',
      'shipments:print',
      'shipments:manage_documents',
      'stock_management:view',
    ];
    extraPermissions.forEach((p) => discoveredPermissions.add(p));

    await measureStartupStep('PermissionDiscoveryService.syncPermissions()', () =>
      this.syncPermissions(Array.from(discoveredPermissions)),
    );
  }

  private async syncPermissions(permissions: string[]) {
    const discovered: DiscoveredPermission[] = [];
    for (const permKey of permissions) {
      let [resourceName, actionName] = permKey.split(':');
      if (!resourceName || !actionName) continue;

      actionName = actionName.toUpperCase();

      if (
        resourceName === 'sales-contract' ||
        resourceName === 'sales_contracts'
      ) {
        resourceName = 'sales_contract';
      }
      if (resourceName === 'follow-up' || resourceName === 'follow_ups') {
        resourceName = 'follow_up';
      }

      let moduleName = resourceName
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (resourceName.startsWith('chat_') || resourceName === 'chat')
        moduleName = 'Chat';
      else if (resourceName === 'sales_contract') moduleName = 'Sales Contract';
      else if (resourceName === 'stock_management')
        moduleName = 'Stock Management';
      else if (resourceName === 'follow_up') moduleName = 'Follow Up';
      else if (resourceName === 'hrpolicy') moduleName = 'HR Policy';
      else if (resourceName === 'leave_requests' || resourceName === 'leave')
        moduleName = 'Leaves';
      else if (resourceName === 'leave_types') moduleName = 'Leave Types';
      else if (resourceName.startsWith('employee_')) moduleName = 'Employees';
      else if (resourceName.startsWith('attendance_'))
        moduleName = 'Attendance';
      else if (resourceName === 'shipments' || resourceName === 'shipment')
        moduleName = 'Shipments';
      else if (
        resourceName === 'shipment_stuffing_execution' ||
        resourceName === 'documents'
      )
        moduleName = 'Documents';

      const isSystemLevel =
        ['clients', 'subscriptions', 'system'].includes(resourceName) ||
        resourceName.startsWith('system');

      discovered.push({
        resourceName,
        actionName,
        moduleName,
        isSystemLevel,
      });
    }

    if (discovered.length === 0) return;

    const moduleNames = [...new Set(discovered.map(({ moduleName }) => moduleName))];
    const resourceNames = [
      ...new Set(discovered.map(({ resourceName }) => resourceName)),
    ];
    const actionNames = [
      ...new Set(discovered.map(({ actionName }) => actionName)),
    ];
    const transaction = await this.appModuleModel.sequelize.transaction();
    const bulkCreateInBatches = async <T>(
      records: T[],
      createBatch: (batch: T[]) => Promise<unknown>,
    ): Promise<void> => {
      for (let offset = 0; offset < records.length; offset += 500) {
        await createBatch(records.slice(offset, offset + 500));
      }
    };

    try {
      await this.appModuleModel.sequelize.query(
        `SELECT pg_advisory_xact_lock(hashtext('agricom_permission_discovery_sync'))`,
        { transaction },
      );

      const [
        adminRole,
        clientAdminRole,
        clients,
        existingModules,
        existingResources,
      ] = await Promise.all([
        this.roleModel.findOne({
          where: { name: 'Admin', clientId: null },
          transaction,
        }),
        this.roleModel.findOne({
          where: { name: 'Client Admin', clientId: null },
          transaction,
        }),
        this.clientModel.findAll({
          attributes: ['id'],
          transaction,
        }),
        this.appModuleModel.findAll({
          where: { name: { [Op.in]: moduleNames } },
          transaction,
        }),
        this.moduleResourceModel.findAll({
          where: { name: { [Op.in]: resourceNames } },
          transaction,
        }),
      ]);

      const existingModuleNames = new Set(
        existingModules.map((module) => module.name),
      );
      const missingModules = moduleNames
        .filter((moduleName) => !existingModuleNames.has(moduleName))
        .map((moduleName) => ({
          name: moduleName,
          sort_order: discovered.find(
            (permission) => permission.moduleName === moduleName,
          )?.isSystemLevel
            ? 99
            : 10,
        }));
      if (missingModules.length > 0) {
        await bulkCreateInBatches(missingModules, (batch) =>
          this.appModuleModel.bulkCreate(batch, { transaction }),
        );
      }

      const modules = await this.appModuleModel.findAll({
        where: { name: { [Op.in]: moduleNames } },
        transaction,
      });
      const moduleIdByName = new Map(
        modules.map((module) => [module.name, module.id]),
      );
      if (moduleIdByName.size !== moduleNames.length) {
        throw new Error('Permission sync could not resolve every module ID.');
      }
      const moduleIdByResource = new Map<string, number>();
      for (const permission of discovered) {
        const moduleId = moduleIdByName.get(permission.moduleName);
        if (moduleId !== undefined) {
          moduleIdByResource.set(permission.resourceName, moduleId);
        }
      }
      if (moduleIdByResource.size !== resourceNames.length) {
        throw new Error('Permission sync could not resolve every resource module.');
      }

      const existingResourceNames = new Set(
        existingResources.map((resource) => resource.name),
      );
      const missingResources = resourceNames
        .filter((name) => !existingResourceNames.has(name))
        .map((name) => ({
          name,
          display_name:
            name === 'shipment_stuffing_execution'
              ? 'Shipment Stuffing Execution'
              : name,
          module_id: moduleIdByResource.get(name),
          sort_order: 0,
        }));
      if (missingResources.length > 0) {
        await bulkCreateInBatches(missingResources, (batch) =>
          this.moduleResourceModel.bulkCreate(batch, { transaction }),
        );
      }

      const resources = await this.moduleResourceModel.findAll({
        where: { name: { [Op.in]: resourceNames } },
        transaction,
      });
      const resourceIdByName = new Map(
        resources.map((resource) => [resource.name, resource.id]),
      );
      if (resourceIdByName.size !== resourceNames.length) {
        throw new Error('Permission sync could not resolve every resource ID.');
      }
      const resourcesToMove = resources
        .filter(
          (resource) =>
            (moduleIdByResource.get(resource.name) !== undefined &&
              resource.module_id !== moduleIdByResource.get(resource.name)) ||
            (resource.name === 'shipment_stuffing_execution' &&
              resource.display_name !== 'Shipment Stuffing Execution'),
        )
        .map((resource) => ({
          id: resource.id,
          module_id: moduleIdByResource.get(resource.name),
          display_name:
            resource.name === 'shipment_stuffing_execution'
              ? 'Shipment Stuffing Execution'
              : resource.display_name,
        }));
      if (resourcesToMove.length > 0) {
        await bulkCreateInBatches(resourcesToMove, (batch) =>
          this.moduleResourceModel.bulkCreate(batch, {
            updateOnDuplicate: ['module_id', 'display_name'],
            transaction,
          }),
        );
      }

      const resourceIds = [...new Set(resourceIdByName.values())];
      const existingActions =
        resourceIds.length > 0
          ? await this.resourceActionModel.findAll({
              where: {
                resource_id: { [Op.in]: resourceIds },
                name: { [Op.in]: actionNames },
              },
              transaction,
            })
          : [];
      const actionKey = (resourceId: number, actionName: string) =>
        `${resourceId}:${actionName}`;
      const existingActionKeys = new Set(
        existingActions.map((action) =>
          actionKey(action.resource_id, action.name),
        ),
      );
      const missingActions = discovered.flatMap((permission) => {
        const resourceId = resourceIdByName.get(permission.resourceName);
        if (
          resourceId === undefined ||
          existingActionKeys.has(actionKey(resourceId, permission.actionName))
        ) {
          return [];
        }
        existingActionKeys.add(actionKey(resourceId, permission.actionName));
        return [
          {
            name: permission.actionName,
            display_name: permission.actionName,
            resource_id: resourceId,
            sort_order: 0,
          },
        ];
      });
      if (missingActions.length > 0) {
        await bulkCreateInBatches(missingActions, (batch) =>
          this.resourceActionModel.bulkCreate(batch, { transaction }),
        );
      }

      const actions =
        resourceIds.length > 0
          ? await this.resourceActionModel.findAll({
              where: {
                resource_id: { [Op.in]: resourceIds },
                name: { [Op.in]: actionNames },
              },
              transaction,
            })
          : [];
      const actionIdByKey = new Map(
        actions.map((action) => [
          actionKey(action.resource_id, action.name),
          action.id,
        ]),
      );
      const expectedActionKeys = new Set<string>();
      for (const permission of discovered) {
        const resourceId = resourceIdByName.get(permission.resourceName);
        if (resourceId === undefined) {
          throw new Error('Permission sync could not resolve a resource ID.');
        }
        expectedActionKeys.add(actionKey(resourceId, permission.actionName));
      }
      if ([...expectedActionKeys].some((key) => !actionIdByKey.has(key))) {
        throw new Error('Permission sync could not resolve every action ID.');
      }
      const moduleIds = [...new Set(moduleIdByName.values())];
      const actionIds = [...new Set(actionIdByKey.values())];

      if (clients.length > 0 && moduleIds.length > 0) {
        const existingAccess = await this.clientModuleAccessModel.findAll({
          where: { module_id: { [Op.in]: moduleIds } },
          attributes: ['client_id', 'module_id'],
          transaction,
        });
        const accessKeys = new Set(
          existingAccess.map(
            (access) => `${access.client_id}:${access.module_id}`,
          ),
        );
        const missingAccess = clients.flatMap((client) =>
          moduleIds.flatMap((moduleId) => {
            const key = `${client.id}:${moduleId}`;
            if (accessKeys.has(key)) return [];
            accessKeys.add(key);
            return [{ client_id: client.id, module_id: moduleId }];
          }),
        );
        if (missingAccess.length > 0) {
          await bulkCreateInBatches(missingAccess, (batch) =>
            this.clientModuleAccessModel.bulkCreate(batch, { transaction }),
          );
        }
      }

      if (clients.length > 0 && actionIds.length > 0) {
        const existingAccess = await this.clientActionAccessModel.findAll({
          where: { resource_action_id: { [Op.in]: actionIds } },
          attributes: ['client_id', 'resource_action_id'],
          transaction,
        });
        const accessKeys = new Set(
          existingAccess.map(
            (access) => `${access.client_id}:${access.resource_action_id}`,
          ),
        );
        const missingAccess = clients.flatMap((client) =>
          actionIds.flatMap((actionId) => {
            const key = `${client.id}:${actionId}`;
            if (accessKeys.has(key)) return [];
            accessKeys.add(key);
            return [
              { client_id: client.id, resource_action_id: actionId },
            ];
          }),
        );
        if (missingAccess.length > 0) {
          await bulkCreateInBatches(missingAccess, (batch) =>
            this.clientActionAccessModel.bulkCreate(batch, { transaction }),
          );
        }
      }

      const roles = [
        adminRole,
        ...(discovered.some(({ isSystemLevel }) => !isSystemLevel)
          ? [clientAdminRole]
          : []),
      ].filter((role): role is Role => role !== null);
      if (roles.length > 0 && actionIds.length > 0) {
        const roleIds = [...new Set(roles.map((role) => role.id))];
        const existingPermissions =
          await this.roleActionPermissionModel.findAll({
            where: {
              role_id: { [Op.in]: roleIds },
              resource_action_id: { [Op.in]: actionIds },
            },
            attributes: ['role_id', 'resource_action_id'],
            transaction,
          });
        const permissionKeys = new Set(
          existingPermissions.map(
            (permission) =>
              `${permission.role_id}:${permission.resource_action_id}`,
          ),
        );
        const missingPermissions = discovered.flatMap((permission) => {
          const resourceId = resourceIdByName.get(permission.resourceName);
          if (resourceId === undefined) return [];
          const actionId = actionIdByKey.get(
            actionKey(resourceId, permission.actionName),
          );
          if (actionId === undefined) return [];

          const targetRoles = [
            ...(adminRole ? [adminRole] : []),
            ...(clientAdminRole && !permission.isSystemLevel
              ? [clientAdminRole]
              : []),
          ];
          return targetRoles.flatMap((role) => {
            const key = `${role.id}:${actionId}`;
            if (permissionKeys.has(key)) return [];
            permissionKeys.add(key);
            return [{ role_id: role.id, resource_action_id: actionId }];
          });
        });
        if (missingPermissions.length > 0) {
          await bulkCreateInBatches(missingPermissions, (batch) =>
            this.roleActionPermissionModel.bulkCreate(batch, { transaction }),
          );
        }
      }

      await transaction.commit();
      this.logger.log(
        `Permission discovery and sync (v2) completed for ${discovered.length} permissions.`,
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
