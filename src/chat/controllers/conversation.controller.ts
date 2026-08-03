import {
  Controller,
  Post,
  Get,
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
} from '@nestjs/common';
import { ConversationService } from '../services/conversation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateConversationDto, UpdateConversationDto } from '../dto/chat.dto';
import { ConversationType } from '../constants/chat.constants';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

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
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateConversationDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.conversationService.create(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('chat:read')
  findAll(
    @Request() req,
    @Query('type') type?: ConversationType,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = req.user.userId || req.user.id;
    return this.conversationService.getConversations(companyId, userId, {
      type,
      entityType,
      entityId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:read')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.conversationService.getConversationById(id, companyId);
  }

  @Put(':id')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.conversationService.update(id, companyId, dto, actor);
  }

  @Delete(':id')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.archive(id, companyId, true, actor);
  }

  @Post(':id/lock')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  @HttpCode(HttpStatus.OK)
  async lock(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.setLock(id, companyId, true, actor);
    return { message: 'Conversation locked successfully.' };
  }

  @Post(':id/unlock')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:moderate')
  @HttpCode(HttpStatus.OK)
  async unlock(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.setLock(id, companyId, false, actor);
    return { message: 'Conversation unlocked successfully.' };
  }
}
