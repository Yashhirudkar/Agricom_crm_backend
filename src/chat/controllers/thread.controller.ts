import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ThreadService } from '../services/thread.service';
import { ReplyInThreadDto, GetThreadRepliesDto } from '../dto/thread.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat/conversations/:conversationId/threads')
@UseGuards(JwtAuthGuard, PermissionsGuard, ConversationGuard)
export class ThreadController {
  constructor(private readonly threadService: ThreadService) {}

  @Post(':messageId/replies')
  @RequirePermission('chat:create')
  async replyInThread(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() dto: ReplyInThreadDto,
    @CurrentUser() user: any,
  ) {
    return this.threadService.replyInThread(conversationId, messageId, dto, user);
  }

  @Get(':messageId/replies')
  @RequirePermission('chat:read')
  async getThreadReplies(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query() query: GetThreadRepliesDto,
  ) {
    return this.threadService.getThreadReplies(conversationId, messageId, query);
  }

  @Get(':messageId/summary')
  @RequirePermission('chat:read')
  async getThreadSummary(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @CurrentUser() user: any,
  ) {
    return this.threadService.getThreadSummary(conversationId, messageId, user.id);
  }
}
