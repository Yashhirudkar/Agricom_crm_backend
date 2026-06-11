import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNotification(@Body() dto: { userId: number; title: string; message: string; type?: string; entityType?: string; entityId?: number }) {
    return this.notificationsService.createNotification(dto);
  }

  @Get()
  async getNotifications(@Request() req) {
    const userId = req.user.userId || req.user.sub;
    return this.notificationsService.getNotifications(userId);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Body() body: { id: number }, @Request() req) {
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
