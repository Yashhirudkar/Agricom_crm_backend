import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ConversationAdminService } from '../services/conversation-admin.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConversationAdminController {
  constructor(private readonly adminService: ConversationAdminService) {}

  @Post('labels')
  @RequirePermission('chat:create')
  async createLabel(
    @Body() dto: { name: string; color?: string; scope?: 'GLOBAL' | 'COMPANY' | 'PERSONAL' },
    @CurrentUser() user: any,
  ) {
    return this.adminService.createLabel(user.companyId, user.id, dto);
  }

  @Get('labels')
  @RequirePermission('chat:read')
  async getLabels(@CurrentUser() user: any) {
    return this.adminService.getLabels(user.companyId, user.id);
  }

  @Post('conversations/:conversationId/labels/:labelId')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  async assignLabel(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
  ) {
    await this.adminService.assignLabel(conversationId, labelId);
    return { success: true };
  }

  @Delete('conversations/:conversationId/labels/:labelId')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  async removeLabel(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
  ) {
    await this.adminService.removeLabel(conversationId, labelId);
    return { success: true };
  }

  @Get('conversations/:conversationId/labels')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async getConversationLabels(
    @Param('conversationId', ParseIntPipe) conversationId: number,
  ) {
    return this.adminService.getConversationLabels(conversationId);
  }

  @Put('conversations/:conversationId/freeze')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  async setFreeze(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body('isFrozen') isFrozen: boolean,
    @CurrentUser() user: any,
  ) {
    return this.adminService.setConversationFreeze(conversationId, isFrozen, user);
  }

  @Put('conversations/:conversationId/transfer-ownership')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  async transferOwnership(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body('newOwnerUserId', ParseIntPipe) newOwnerUserId: number,
    @CurrentUser() user: any,
  ) {
    return this.adminService.transferOwnership(conversationId, newOwnerUserId, user);
  }

  @Post('conversations/:conversationId/members/bulk-add')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  async bulkAddMembers(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body('userIds') userIds: number[],
    @Body('role') role: any,
    @CurrentUser() user: any,
  ) {
    return this.adminService.bulkAddMembers(conversationId, userIds, role, user);
  }

  @Post('conversations/:conversationId/members/bulk-remove')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  async bulkRemoveMembers(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body('userIds') userIds: number[],
    @CurrentUser() user: any,
  ) {
    return this.adminService.bulkRemoveMembers(conversationId, userIds, user);
  }
}
