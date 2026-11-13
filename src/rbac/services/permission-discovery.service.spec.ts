import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { AppModule as AppModuleModel } from '../../system/models/app-module.model';
import { ModuleResource } from '../../system/models/module-resource.model';
import { ResourceAction } from '../../system/models/resource-action.model';
import { Role } from '../models/role.model';
import { RoleActionPermission } from '../models/role-action-permission.model';
import { Client } from '../../clients/models/client.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';
import { ClientModuleAccess } from '../../clients/models/client-module-access.model';
import { PermissionDiscoveryService } from './permission-discovery.service';

type Row = Record<string, any>;

function createTable() {
  const rows: Row[] = [];
  let nextId = 1;
  return {
    rows,
    findAll: jest.fn(async () => rows),
    bulkCreate: jest.fn(async (records: Row[]) => {
      rows.push(
        ...records.map((record) => ({ ...record, id: nextId++ })),
      );
    }),
  };
}

describe('PermissionDiscoveryService', () => {
  it('bulk synchronizes missing permissions and is idempotent on a second run', async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    const appModules = createTable();
    const moduleResources = createTable();
    const resourceActions = createTable();
    const clientModuleAccess = createTable();
    const clientActionAccess = createTable();
    const roleActionPermissions = createTable();
    const adminRole = { id: 1, name: 'Admin' };
    const clientAdminRole = { id: 2, name: 'Client Admin' };
    const appModuleModel = {
      ...appModules,
      sequelize: {
        transaction: jest.fn().mockResolvedValue(transaction),
        query: jest.fn().mockResolvedValue([]),
      },
    };
    const roleModel = {
      findOne: jest.fn(({ name }: { name: string }) =>
        Promise.resolve(name === 'Admin' ? adminRole : clientAdminRole),
      ),
    };
    const clientModel = {
      findAll: jest.fn().mockResolvedValue([{ id: 10 }]),
    };
    const discoveryService = {
      getControllers: jest.fn().mockReturnValue([]),
    };
    const service = new PermissionDiscoveryService(
      discoveryService as unknown as DiscoveryService,
      {} as MetadataScanner,
      {} as Reflector,
      appModuleModel as unknown as typeof AppModuleModel,
      moduleResources as unknown as typeof ModuleResource,
      resourceActions as unknown as typeof ResourceAction,
      roleModel as unknown as typeof Role,
      roleActionPermissions as unknown as typeof RoleActionPermission,
      clientModel as unknown as typeof Client,
      clientActionAccess as unknown as typeof ClientActionAccess,
      clientModuleAccess as unknown as typeof ClientModuleAccess,
    );

    await service.onApplicationBootstrap();

    expect(appModules.rows.length).toBeGreaterThan(0);
    expect(moduleResources.rows.length).toBeGreaterThan(0);
    expect(resourceActions.rows.length).toBeGreaterThan(0);
    expect(clientModuleAccess.rows.length).toBe(appModules.rows.length);
    expect(clientActionAccess.rows.length).toBe(resourceActions.rows.length);
    expect(roleActionPermissions.rows.length).toBeGreaterThan(0);

    const initialRowCounts = [
      appModules.rows.length,
      moduleResources.rows.length,
      resourceActions.rows.length,
      clientModuleAccess.rows.length,
      clientActionAccess.rows.length,
      roleActionPermissions.rows.length,
    ];
    await service.onApplicationBootstrap();

    expect([
      appModules.rows.length,
      moduleResources.rows.length,
      resourceActions.rows.length,
      clientModuleAccess.rows.length,
      clientActionAccess.rows.length,
      roleActionPermissions.rows.length,
    ]).toEqual(initialRowCounts);
    expect(transaction.commit).toHaveBeenCalledTimes(2);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});
