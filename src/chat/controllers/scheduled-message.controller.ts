import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ScheduledMessageService } from '../services/scheduled-message.service';
import { CreateScheduledMessageDto } from '../dto/scheduled-message.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScheduledMessageController {
  constructor(private readonly scheduledService: ScheduledMessageService) {}

  @Post('conversations/:conversationId/scheduled-messages')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:create')
  async scheduleMessage(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() dto: CreateScheduledMessageDto,
    @CurrentUser() user: any,
  ) {
    return this.scheduledService.scheduleMessage(conversationId, dto, user);
  }

  @Get('conversations/:conversationId/scheduled-messages')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  async getScheduledMessages(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: any,
  ) {
    return this.scheduledService.getScheduledMessages(conversationId, user.id);
  }

  @Delete('scheduled-messages/:id')
  @RequirePermission('chat:create')
  async cancelScheduledMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.scheduledService.cancelScheduled(id, user.id);
    return { success: true, message: 'Scheduled message cancelled' };
  }
}
