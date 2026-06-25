import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ClientFolderAccess } from '../models/client-folder-access.model';
import { ClientItemAccess } from '../models/client-item-access.model';
import { ClientModuleAccess } from '../models/client-module-access.model';
import { ClientActionAccess } from '../models/client-action-access.model';
import { Client } from '../models/client.model';
import { SystemAuditService } from '../../system/services/system-audit.service';

@Injectable()
export class ClientsAccessService {
  constructor(
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    @InjectModel(ClientFolderAccess)
    private readonly clientFolderAccessModel: typeof ClientFolderAccess,
    @InjectModel(ClientItemAccess)
    private readonly clientItemAccessModel: typeof ClientItemAccess,
    @InjectModel(ClientModuleAccess)
    private readonly clientModuleAccessModel: typeof ClientModuleAccess,
    @InjectModel(ClientActionAccess)
    private readonly clientActionAccessModel: typeof ClientActionAccess,
    private readonly systemAuditService: SystemAuditService,
  ) {}

  async updateAccessConfig(
    userId: number | null,
    clientId: number,
    dto: {
      folder_ids: number[];
      item_ids: number[];
      module_ids: number[];
      action_ids: number[];
    },
  ) {
    const client = await this.clientModel.findByPk(clientId);
    if (!client) throw new NotFoundException('Client not found');

    // Start by clearing old mappings
    await this.clientFolderAccessModel.destroy({
      where: { client_id: clientId },
    });
    await this.clientItemAccessModel.destroy({
      where: { client_id: clientId },
    });
    await this.clientModuleAccessModel.destroy({
      where: { client_id: clientId },
    });
    await this.clientActionAccessModel.destroy({
      where: { client_id: clientId },
    });

    // Insert new mappings
    if (dto.folder_ids && dto.folder_ids.length > 0) {
      await this.clientFolderAccessModel.bulkCreate(
        dto.folder_ids.map(
          (id) => ({ client_id: clientId, folder_id: id }) as any,
        ),
      );
    }
    if (dto.item_ids && dto.item_ids.length > 0) {
      await this.clientItemAccessModel.bulkCreate(
        dto.item_ids.map((id) => ({ client_id: clientId, item_id: id }) as any),
      );
    }
    if (dto.module_ids && dto.module_ids.length > 0) {
      await this.clientModuleAccessModel.bulkCreate(
        dto.module_ids.map(
          (id) => ({ client_id: clientId, module_id: id }) as any,
        ),
      );
    }
    if (dto.action_ids && dto.action_ids.length > 0) {
      await this.clientActionAccessModel.bulkCreate(
        dto.action_ids.map(
          (id) => ({ client_id: clientId, resource_action_id: id }) as any,
        ),
      );
    }

    await this.systemAuditService.logAction(userId, 'CLIENT_ACCESS_UPDATE', {
      clientId,
      dto,
    });
    return {
      success: true,
      message: 'Client access config updated successfully',
    };
  }
}
