import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatAnalyticsService } from '../services/chat-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatAnalyticsController {
  constructor(private readonly analyticsService: ChatAnalyticsService) {}

  @Get('overview')
  @RequirePermission('chat:moderate')
  async getOverview(
    @Query('days') days: string,
    @CurrentUser() user: any,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getOverview(user.companyId, parsedDays);
  }

  @Get('top-channels')
  @RequirePermission('chat:moderate')
  async getTopChannels(
    @Query('limit') limit: string,
    @CurrentUser() user: any,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.analyticsService.getTopChannels(user.companyId, parsedLimit);
  }

  @Get('daily-volume')
  @RequirePermission('chat:moderate')
  async getDailyVolume(
    @Query('days') days: string,
    @CurrentUser() user: any,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 14;
    return this.analyticsService.getDailyVolume(user.companyId, parsedDays);
  }
}
