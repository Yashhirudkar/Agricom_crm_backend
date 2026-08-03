import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { UnreadService } from '../services/unread.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat/unread')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnreadController {
  constructor(private readonly unreadService: UnreadService) {}

  @Get('total')
  @RequirePermission('chat:read')
  async getTotalUnread(@CurrentUser() user: any) {
    return this.unreadService.getUserTotalUnread(user.id, user.companyId);
  }

  @Get('sidebar')
  @RequirePermission('chat:read')
  async getSidebarUnread(@CurrentUser() user: any) {
    return this.unreadService.getSidebarUnreadBreakdown(user.id, user.companyId);
  }
}
