import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { SendMessageDto, ReactMessageDto } from '../dto/chat.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard, ConversationGuard)
@Controller('conversations/:conversationId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getActor(req: any) {
    return {
      userId: req.user.userId || req.user.id || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      type: req.user.type || null,
    };
  }

  @Post()
  @RequirePermission('chat:create')
  send(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() dto: SendMessageDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.messageService.send(conversationId, companyId, dto, actor);
  }

  @Put(':messageId')
  @RequirePermission('chat:update')
  edit(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body('content') content: string,
    @Request() req,
  ) {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Message content cannot be empty.');
    }
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.messageService.edit(conversationId, messageId, content, companyId, actor);
  }

  @Delete('clear')
  @RequirePermission('chat:delete')
  @HttpCode(HttpStatus.OK)
  async clearChat(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = req.user.userId || req.user.id;
    await this.messageService.clearChat(conversationId, companyId, userId);
    return { success: true };
  }

  @Delete(':messageId')
  @RequirePermission('chat:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query('mode') mode: 'everyone' | 'me',
    @Request() req,
  ) {
    if (!mode || !['everyone', 'me'].includes(mode)) {
      throw new BadRequestException('Delete mode must be either "everyone" or "me".');
    }
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.messageService.delete(conversationId, messageId, mode, companyId, actor);
  }

  @Post(':messageId/react')
  @RequirePermission('chat:react')
  react(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() dto: ReactMessageDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.messageService.react(conversationId, messageId, dto, companyId, actor);
  }

  @Post('read')
  @RequirePermission('chat:read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body('lastMessageId', ParseIntPipe) lastMessageId: number,
    @Request() req,
  ) {
    const userId = req.user.userId || req.user.id;
    await this.messageService.markRead(conversationId, lastMessageId, userId);
    return { success: true };
  }

  @Get('history')
  @RequirePermission('chat:read')
  getHistory(
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = req.user.userId || req.user.id;
    const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    return this.messageService.getHistory(conversationId, companyId, userId, parsedCursor, parsedLimit);
  }

  @Get(':messageId/versions')
  @RequirePermission('chat:read')
  getVersions(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.messageService.getMessageVersions(messageId, companyId);
  }
}
