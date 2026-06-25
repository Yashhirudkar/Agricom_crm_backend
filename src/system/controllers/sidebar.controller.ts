import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SidebarService } from '../services/sidebar.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system/sidebar')
export class SidebarController {
  constructor(private readonly sidebarService: SidebarService) {}

  @Get('tree')
  @RequirePermission('system:manage_sidebar')
  async getTree() {
    return this.sidebarService.getTree();
  }

  @Post('folder')
  @RequirePermission('system:manage_sidebar') // Only Super Admin should have this
  async createFolder(
    @Req() req: any,
    @Body()
    dto: {
      name: string;
      icon_name?: string;
      icon_color?: string;
      is_collapsible?: boolean;
      sort_order?: number;
    },
  ) {
    return this.sidebarService.createFolder(req.user.id, dto);
  }

  @Post('item')
  @RequirePermission('system:manage_sidebar')
  async createItem(
    @Req() req: any,
    @Body()
    dto: {
      name: string;
      route: string;
      folder_id?: number;
      icon_name?: string;
      icon_color?: string;
      use_folder_color?: boolean;
      permission_link?: string;
      sort_order?: number;
    },
  ) {
    return this.sidebarService.createItem(req.user.id, dto);
  }

  @Patch('item/:id/move')
  @RequirePermission('system:manage_sidebar')
  async moveItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { folder_id: number | null },
  ) {
    return this.sidebarService.moveItem(
      req.user.id,
      parseInt(id, 10),
      dto.folder_id,
    );
  }

  @Patch('reorder')
  @RequirePermission('system:manage_sidebar')
  async reorder(
    @Req() req: any,
    @Body()
    body: {
      updates: { id: number; type: 'FOLDER' | 'ITEM'; sort_order: number }[];
    },
  ) {
    return this.sidebarService.reorder(req.user.id, body.updates);
  }

  @Patch('folder/:id')
  @RequirePermission('system:manage_sidebar')
  async updateFolder(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      icon_name?: string;
      icon_color?: string;
      is_collapsible?: boolean;
    },
  ) {
    return this.sidebarService.updateFolder(req.user.id, parseInt(id, 10), dto);
  }

  @Patch('item/:id')
  @RequirePermission('system:manage_sidebar')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      route?: string;
      icon_name?: string;
      icon_color?: string;
      use_folder_color?: boolean;
      permission_link?: string;
    },
  ) {
    return this.sidebarService.updateItem(req.user.id, parseInt(id, 10), dto);
  }

  @Delete('folder/:id')
  @RequirePermission('system:manage_sidebar')
  async deleteFolder(@Req() req: any, @Param('id') id: string) {
    return this.sidebarService.deleteFolder(req.user.id, parseInt(id, 10));
  }

  @Delete('item/:id')
  @RequirePermission('system:manage_sidebar')
  async deleteItem(@Req() req: any, @Param('id') id: string) {
    return this.sidebarService.deleteItem(req.user.id, parseInt(id, 10));
  }
}
