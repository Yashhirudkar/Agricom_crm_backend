import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { ConversationService } from '../services/conversation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ConversationGuard } from '../guards/conversation.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateConversationDto, UpdateConversationDto, UpdatePostingPolicyDto } from '../dto/chat.dto';
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

  @Post('upload-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/chat';
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `group-avatar-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif|svg\+xml)$/)) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadGroupPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    const fileUrl = `/uploads/chat/${file.filename}`;
    return { message: 'Group photo uploaded successfully', fileUrl };
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
    @Query('archived') archived?: string,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = req.user.userId || req.user.id;
    return this.conversationService.getConversations(companyId, userId, {
      type,
      entityType,
      entityId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      archived: archived === 'true',
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
  async delete(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.delete(id, companyId, actor);
  }

  @Post(':id/archive')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:delete')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.archive(id, companyId, true, actor);
    return { success: true };
  }

  @Post(':id/unarchive')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:delete')
  @HttpCode(HttpStatus.OK)
  async unarchive(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    await this.conversationService.archive(id, companyId, false, actor);
    return { message: 'Conversation unarchived successfully.' };
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

  /**
   * PATCH /conversations/:id/posting-policy
   * Update who can post in a channel. Requires chat:update or chat_channel:update_posting_policy.
   */
  @Patch(':id/posting-policy')
  @UseGuards(ConversationGuard)
  @RequirePermission('chat:update')
  @HttpCode(HttpStatus.OK)
  async updatePostingPolicy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostingPolicyDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.conversationService.updatePostingPolicy(id, companyId, dto, actor);
  }
}
