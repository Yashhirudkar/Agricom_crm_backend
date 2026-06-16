import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';
import { CreateNotificationDto, MarkAsReadDto } from '../dto/notifications.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNotification(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.createNotification(dto);
  }

  @Get()
  async getNotifications(@Request() req) {
    const userId = req.user.userId || req.user.sub;
    return this.notificationsService.getNotifications(userId);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Body() body: MarkAsReadDto, @Request() req) {
    const userId = req.user.userId || req.user.sub;
    return this.notificationsService.markAsRead(body.id, userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req) {
    const userId = req.user.userId || req.user.sub;
    return this.notificationsService.markAllAsRead(userId);
  }
}
