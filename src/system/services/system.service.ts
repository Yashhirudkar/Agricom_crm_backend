import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SidebarFolder } from '../models/sidebar-folder.model';
import { SidebarItem } from '../models/sidebar-item.model';
import { ClientFolderAccess } from '../../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../../clients/models/client-item-access.model';

@Injectable()
export class SystemService {
  constructor(
    @InjectModel(SidebarFolder)
    private readonly sidebarFolderModel: typeof SidebarFolder,
    @InjectModel(SidebarItem)
    private readonly sidebarItemModel: typeof SidebarItem,
    @InjectModel(ClientFolderAccess)
    private readonly clientFolderAccessModel: typeof ClientFolderAccess,
    @InjectModel(ClientItemAccess)
    private readonly clientItemAccessModel: typeof ClientItemAccess,
  ) {}

  async getSidebar(user: any) {
    // Check if Super Admin using user.type
    const isSuperAdmin = user.type === 'super_admin';

    const folders = await this.sidebarFolderModel.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC']],
      include: [{
        model: SidebarItem,
        where: { is_active: true },
        required: false,
      }],
    });
    
    // Sort items within folders
    folders.forEach(f => {
      if (f.items) {
        f.items.sort((a, b) => a.sort_order - b.sort_order);
      }
    });

    const standaloneItems = await this.sidebarItemModel.findAll({
      where: { is_active: true, folder_id: null },
      order: [['sort_order', 'ASC']],
    });

    if (isSuperAdmin) {
      return { folders, standaloneItems };
    }

    // Client user filtering
    const clientId = user.clientId;
    if (!clientId) {
      return { folders: [], standaloneItems: [] };
    }

    const allowedFolderIds = (await this.clientFolderAccessModel.findAll({ where: { client_id: clientId } })).map(a => a.folder_id);
    const allowedItemIds = (await this.clientItemAccessModel.findAll({ where: { client_id: clientId } })).map(a => a.item_id);

    const filteredFolders = folders
      .filter(f => allowedFolderIds.includes(f.id))
      .map(f => {
        const jsonF = f.toJSON() as any;
        jsonF.items = (jsonF.items || []).filter((i: any) => allowedItemIds.includes(i.id));
        return jsonF;
      });

    const filteredStandaloneItems = standaloneItems.filter(i => allowedItemIds.includes(i.id));

    return { folders: filteredFolders, standaloneItems: filteredStandaloneItems };
  }
}
