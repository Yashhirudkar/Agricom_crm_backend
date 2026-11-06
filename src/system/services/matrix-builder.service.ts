import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AppModule as AppModuleModel } from '../models/app-module.model';
import { ModuleResource } from '../models/module-resource.model';
import { ResourceAction } from '../models/resource-action.model';
import { SystemAuditService } from './system-audit.service';
import { Client } from '../../clients/models/client.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';

@Injectable()
export class MatrixBuilderService {
  constructor(
    @InjectModel(AppModuleModel)
    private readonly appModuleModel: typeof AppModuleModel,
    @InjectModel(ModuleResource)
    private readonly moduleResourceModel: typeof ModuleResource,
    @InjectModel(ResourceAction)
    private readonly resourceActionModel: typeof ResourceAction,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    @InjectModel(ClientActionAccess)
    private readonly clientActionAccessModel: typeof ClientActionAccess,
    private readonly systemAuditService: SystemAuditService,
  ) {}

  async getRegistry() {
    await this.ensureStockManagementPermission();

    const modules = await this.appModuleModel.findAll({
      order: [['sort_order', 'ASC']],
      include: [
        {
          model: ModuleResource,
          as: 'resources',
          order: [['sort_order', 'ASC']],
          include: [
            {
              model: ResourceAction,
              as: 'actions',
              order: [['sort_order', 'ASC']],
            },
          ],
        },
      ],
    });

    return modules
      .filter((mod) =>
        (mod.resources || []).some(
          (resource) => (resource.actions || []).length > 0,
        ),
      )
      .map((mod) => ({
        module_id: mod.id,
        module_name: mod.name,
        resources: (mod.resources || []).map((res) => ({
          resource_id: res.id,
          resource_name: res.name,
          actions: (res.actions || []).map((act) => ({
            action_id: act.id,
            action_name: act.name,
          })),
        })),
      }));
  }

  async createModule(
    userId: number | null,
    dto: { name: string; icon_name?: string; sort_order?: number },
  ) {
    const module = await this.appModuleModel.create({
      name: dto.name,
      icon_name: dto.icon_name || null,
      sort_order: dto.sort_order || 0,
    });

    await this.systemAuditService.logAction(userId, 'MATRIX_MODULE_CREATE', {
      module,
    });
    return module;
  }

  async createResource(
    userId: number | null,
    dto: {
      name: string;
      display_name?: string;
      module_id: number;
      sort_order?: number;
    },
  ) {
    const resource = await this.moduleResourceModel.create({
      name: dto.name,
      display_name: dto.display_name || dto.name,
      module_id: dto.module_id,
      sort_order: dto.sort_order || 0,
    });

    await this.systemAuditService.logAction(userId, 'MATRIX_RESOURCE_CREATE', {
      resource,
    });
    return resource;
  }

  async createAction(
    userId: number | null,
    dto: {
      name: string;
      display_name?: string;
      resource_id: number;
      sort_order?: number;
    },
  ) {
    const action = await this.resourceActionModel.create({
      name: dto.name.toUpperCase(),
      display_name: dto.display_name || dto.name.toUpperCase(),
      resource_id: dto.resource_id,
      sort_order: dto.sort_order || 0,
    });

    await this.systemAuditService.logAction(userId, 'MATRIX_ACTION_CREATE', {
      action,
    });
    return action;
  }

  async deleteModule(userId: number | null, id: number) {
    const module = await this.appModuleModel.findByPk(id);
    if (!module) throw new NotFoundException('Module not found');

    await module.destroy();
    await this.systemAuditService.logAction(userId, 'MATRIX_MODULE_DELETE', {
      id,
      name: module.name,
    });
    return { success: true };
  }

  private async ensureStockManagementPermission(): Promise<void> {
    const [stockModule] = await this.appModuleModel.findOrCreate({
      where: { name: 'Stock Management' },
      defaults: {
        name: 'Stock Management',
        sort_order: 10,
      } as any,
    });

    const [stockResource, resourceCreated] =
      await this.moduleResourceModel.findOrCreate({
        where: { name: 'stock_management' },
        defaults: {
          name: 'stock_management',
          display_name: 'Stock Management',
          module_id: stockModule.id,
          sort_order: 0,
        } as any,
      });

    if (
      !resourceCreated &&
      (stockResource.module_id !== stockModule.id ||
        stockResource.display_name !== 'Stock Management')
    ) {
      stockResource.module_id = stockModule.id;
      stockResource.display_name = 'Stock Management';
      await stockResource.save();
    }

    const [viewAction] = await this.resourceActionModel.findOrCreate({
      where: { name: 'VIEW', resource_id: stockResource.id },
      defaults: {
        name: 'VIEW',
        display_name: 'VIEW',
        resource_id: stockResource.id,
        sort_order: 0,
      } as any,
    });

    const clients = await this.clientModel.findAll({
      attributes: ['id'],
    });

    for (const client of clients) {
      await this.clientActionAccessModel.findOrCreate({
        where: {
          client_id: client.id,
          resource_action_id: viewAction.id,
        },
        defaults: {
          client_id: client.id,
          resource_action_id: viewAction.id,
        } as any,
      });
    }
  }

  async deleteResource(userId: number | null, id: number) {
    const resource = await this.moduleResourceModel.findByPk(id);
    if (!resource) throw new NotFoundException('Resource not found');

    await resource.destroy();
    await this.systemAuditService.logAction(userId, 'MATRIX_RESOURCE_DELETE', {
      id,
      name: resource.name,
    });
    return { success: true };
  }

  async deleteAction(userId: number | null, id: number) {
    const action = await this.resourceActionModel.findByPk(id);
    if (!action) throw new NotFoundException('Action not found');

    await action.destroy();
    await this.systemAuditService.logAction(userId, 'MATRIX_ACTION_DELETE', {
      id,
      name: action.name,
    });
    return { success: true };
  }
}
