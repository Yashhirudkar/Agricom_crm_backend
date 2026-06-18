import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SidebarFolder } from '../models/sidebar-folder.model';
import { SidebarItem } from '../models/sidebar-item.model';
import { SystemAuditService } from './system-audit.service';

@Injectable()
export class SidebarService {
  constructor(
    @InjectModel(SidebarFolder)
    private readonly sidebarFolderModel: typeof SidebarFolder,
    @InjectModel(SidebarItem)
    private readonly sidebarItemModel: typeof SidebarItem,
    private readonly systemAuditService: SystemAuditService,
  ) {}

  async getTree() {
    return this.sidebarFolderModel.findAll({
      where: { is_active: true },
      order: [
        ['sort_order', 'ASC'],
        [{ model: SidebarItem, as: 'items' }, 'sort_order', 'ASC']
      ],
      include: [
        {
          model: SidebarItem,
          as: 'items',
          where: { is_active: true },
          required: false
        }
      ]
    });
  }

  async createFolder(userId: number | null, dto: { name: string; icon_name?: string; sort_order?: number }) {
    const t = await this.sidebarFolderModel.sequelize!.transaction();
    try {
      const folder = await this.sidebarFolderModel.create({
        name: dto.name,
        icon_name: dto.icon_name || null,
        sort_order: dto.sort_order || 0,
      } as any, { transaction: t });

      await this.systemAuditService.logAction(userId, 'SIDEBAR_FOLDER_CREATE', { folder });
      await t.commit();
      return folder;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async createItem(userId: number | null, dto: { name: string; route: string; folder_id?: number; icon_name?: string; permission_link?: string; sort_order?: number }) {
    const t = await this.sidebarItemModel.sequelize!.transaction();
    try {
      const item = await this.sidebarItemModel.create({
        name: dto.name,
        route: dto.route,
        folder_id: dto.folder_id || null,
        icon_name: dto.icon_name || null,
        permission_link: dto.permission_link || null,
        sort_order: dto.sort_order || 0,
      } as any, { transaction: t });

      await this.systemAuditService.logAction(userId, 'SIDEBAR_ITEM_CREATE', { item });
      await t.commit();
      return item;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async updateFolder(userId: number | null, id: number, dto: { name?: string; icon_name?: string }) {
    const folder = await this.sidebarFolderModel.findByPk(id);
    if (!folder) throw new NotFoundException('Folder not found');
    await folder.update(dto);
    await this.systemAuditService.logAction(userId, 'SIDEBAR_FOLDER_UPDATE', { id, dto });
    return folder;
  }

  async updateItem(userId: number | null, id: number, dto: { name?: string; route?: string; icon_name?: string; permission_link?: string }) {
    const item = await this.sidebarItemModel.findByPk(id);
    if (!item) throw new NotFoundException('Item not found');
    await item.update(dto);
    await this.systemAuditService.logAction(userId, 'SIDEBAR_ITEM_UPDATE', { id, dto });
    return item;
  }

  async moveItem(userId: number | null, itemId: number, newFolderId: number | null) {
    const t = await this.sidebarItemModel.sequelize!.transaction();
    try {
      const item = await this.sidebarItemModel.findByPk(itemId, { transaction: t });
      if (!item) throw new NotFoundException('Item not found');

      if (newFolderId !== null) {
        const folder = await this.sidebarFolderModel.findByPk(newFolderId, { transaction: t });
        if (!folder) throw new NotFoundException('Target folder not found');
      }

      item.folder_id = newFolderId as any;
      await item.save({ transaction: t });

      await this.systemAuditService.logAction(userId, 'SIDEBAR_ITEM_MOVE', { id: itemId, newFolderId });
      await t.commit();
      return item;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async reorder(userId: number | null, updates: { id: number; type: 'FOLDER' | 'ITEM'; sort_order: number }[]) {
    const t = await this.sidebarFolderModel.sequelize!.transaction();
    try {
      for (const update of updates) {
        if (update.type === 'FOLDER') {
          await this.sidebarFolderModel.update({ sort_order: update.sort_order }, { where: { id: update.id }, transaction: t });
        } else if (update.type === 'ITEM') {
          await this.sidebarItemModel.update({ sort_order: update.sort_order }, { where: { id: update.id }, transaction: t });
        }
      }

      await this.systemAuditService.logAction(userId, 'SIDEBAR_REORDER', { updates });
      await t.commit();
      return { success: true };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deleteFolder(userId: number | null, id: number) {
    const t = await this.sidebarFolderModel.sequelize!.transaction();
    try {
      const folder = await this.sidebarFolderModel.findByPk(id, { transaction: t });
      if (!folder) throw new NotFoundException('Folder not found');

      await this.sidebarItemModel.destroy({ where: { folder_id: id }, transaction: t });
      await folder.destroy({ transaction: t });

      await this.systemAuditService.logAction(userId, 'SIDEBAR_FOLDER_DELETE', { id, name: folder.name });
      await t.commit();
      return { success: true };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deleteItem(userId: number | null, id: number) {
    const t = await this.sidebarItemModel.sequelize!.transaction();
    try {
      const item = await this.sidebarItemModel.findByPk(id, { transaction: t });
      if (!item) throw new NotFoundException('Item not found');

      await item.destroy({ transaction: t });

      await this.systemAuditService.logAction(userId, 'SIDEBAR_ITEM_DELETE', { id, name: item.name });
      await t.commit();
      return { success: true };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
