import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { MessageExtraService } from '../services/message-extra.service';
import { SaveDraftDto } from '../dto/message-extra.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessageExtraController {
  constructor(private readonly extraService: MessageExtraService) {}

  @Post('conversations/:conversationId/messages/:messageId/pin')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  async pinMessage(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.pinMessage(conversationId, messageId, user);
  }

  @Delete('conversations/:conversationId/messages/:messageId/pin')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  async unpinMessage(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.unpinMessage(conversationId, messageId, user);
  }

  @Get('conversations/:conversationId/pins')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async getPinnedMessages(
    @Param('conversationId', ParseIntPipe) conversationId: number,
  ) {
    return this.extraService.getPinnedMessages(conversationId);
  }

  @Post('messages/:messageId/star')
  @RequirePermission('chat:read')
  async starMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.starMessage(messageId, user.id);
  }

  @Delete('messages/:messageId/star')
  @RequirePermission('chat:read')
  async unstarMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.unstarMessage(messageId, user.id);
  }

  @Get('starred-messages')
  @RequirePermission('chat:read')
  async getStarredMessages(@CurrentUser() user: any) {
    return this.extraService.getStarredMessages(user.id, user.companyId);
  }

  @Post('conversations/:conversationId/draft')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async saveDraft(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() dto: SaveDraftDto,
    @CurrentUser() user: any,
  ) {
    return this.extraService.saveDraft(conversationId, user.id, dto);
  }

  @Get('conversations/:conversationId/draft')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async getDraft(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.getDraft(conversationId, user.id);
  }

  @Delete('conversations/:conversationId/draft')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async deleteDraft(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: any,
  ) {
    return this.extraService.deleteDraft(conversationId, user.id);
  }
}
