import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('v1/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission('task:view')
  @ApiOperation({ summary: 'Get current user notifications' })
  async findAll(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    const notifications = await this.notificationsService.findAll(userId);
    return { success: true, data: notifications };
  }

  @Patch(':id/read')
  @RequirePermission('task:view')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.userId;
    const notification = await this.notificationsService.markAsRead(+id, userId);
    return { success: true, data: notification };
  }

  @Post('mark-all-read')
  @RequirePermission('task:view')
  @ApiOperation({ summary: 'Mark all user notifications as read' })
  async markAllRead(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    const result = await this.notificationsService.markAllRead(userId);
    return { success: true, data: result };
  }

  @Get('admin/logs')
  @RequirePermission('notification:manage')
  @ApiOperation({ summary: 'Admin overview of all notifications' })
  async findAllAdmin(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const isSuperAdmin = req.user.type === 'super_admin';
    const clientId = isSuperAdmin ? null : req.user.clientId;
    const pageNum = page ? Math.max(1, Number(page)) : 1;
    const limitNum = limit ? Math.min(100, Math.max(1, Number(limit))) : 15;
    const logs = await this.notificationsService.findAllAdmin(
      clientId,
      pageNum,
      limitNum,
      search,
      type,
      status,
    );
    return { success: true, data: logs };
  }

  @Get('admin/users')
  @RequirePermission('notification:manage')
  @ApiOperation({ summary: 'Get all users settings for notifications' })
  async findUsersSettings(@Req() req: any) {
    const isSuperAdmin = req.user.type === 'super_admin';
    const clientId = isSuperAdmin ? null : req.user.clientId;
    const users = await this.notificationsService.findUsersSettings(clientId);
    return { success: true, data: users };
  }

  @Post('admin/toggle-mute')
  @RequirePermission('notification:manage')
  @ApiOperation({ summary: 'Toggle notification mute settings for a user' })
  async toggleUserMute(@Body() body: { userId: number; mute: boolean }) {
    const result = await this.notificationsService.toggleUserMute(body.userId, body.mute);
    return { success: true, data: result };
  }

  @Get('admin/copy-setting')
  @RequirePermission('notification:manage')
  @ApiOperation({ summary: 'Get if notification copying to admin is enabled' })
  async getCopySetting(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    const enabled = await this.notificationsService.getCopySetting(userId);
    return { success: true, enabled };
  }

  @Post('admin/copy-setting')
  @RequirePermission('notification:manage')
  @ApiOperation({ summary: 'Set if notification copying to admin is enabled' })
  async setCopySetting(@Req() req: any, @Body() body: { enabled: boolean }) {
    const userId = req.user?.id || req.user?.userId;
    const result = await this.notificationsService.setCopySetting(userId, body.enabled);
    return { success: true, data: result };
  }
}
