import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getAttachmentMulterConfig, ATTACHMENT_UPLOAD_DIR } from '../config/multer.config';
import { AttachmentsService } from '../services/attachments.service';
import { STORAGE_PROVIDER, StorageProvider } from '../providers/storage.provider';
import { Inject } from '@nestjs/common';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import * as fs from 'fs';
import { Response } from 'express';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PolicyService } from '../../chat/services/policy.service';
import { AuditService } from '../../audit/services/audit.service';
import { MessageAttachment } from '../../chat/models/message-attachment.model';
import { Message } from '../../chat/models/message.model';
import { Attachment } from '../models/attachment.model';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly policyService: PolicyService,
    private readonly auditService: AuditService,
    @InjectModel(MessageAttachment)
    private readonly messageAttachmentModel: typeof MessageAttachment,
    @InjectModel(Attachment)
    private readonly attachmentModel: typeof Attachment,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  @RequirePermission('chat:create')
  uploadFile(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive
      ? parseInt(headerOrActive as string, 10)
      : null;

    if (!companyId) {
      // Cleanup the uploaded file if companyId is missing since multer saves it before the interceptor throws
      if (file && file.path) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException('x-company-id header is required');
    }

    const fileUrl = this.attachmentsService.handleFileUpload(file, companyId);
    return {
      message: 'File uploaded successfully',
      fileName: file.originalname,
      fileUrl,
    };
  }

  private async checkAttachmentAccess(attachment: Attachment, user: any, companyId: number) {
    const messageAttachment = await this.messageAttachmentModel.findOne({
      where: { attachmentId: attachment.id },
      include: [{ model: Message, as: 'message' }],
    });

    if (messageAttachment && messageAttachment.message) {
      const conversationId = messageAttachment.message.conversationId;
      await this.policyService.canDownload(conversationId, user, companyId);
    } else {
      const isSuper = user?.type === 'super_admin' || user?.clientId === null;
      if (!isSuper && attachment.companyId !== companyId) {
        throw new ForbiddenException('You do not have access to this attachment.');
      }
    }
  }

  @Get('download/:filename')
  @RequirePermission('chat:read')
  async downloadFile(
    @Param('filename') filename: string,
    @Request() req,
    @Res() res: Response,
  ) {
    // Basic path traversal protection
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new BadRequestException('Invalid filename');
    }

    const attachment = await this.attachmentModel.findOne({
      where: {
        [Op.or]: [
          { storedName: filename },
          { storagePath: filename },
        ],
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment record not found');
    }

    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : attachment.companyId;

    if (!companyId) {
      throw new BadRequestException('Company context is required');
    }

    await this.checkAttachmentAccess(attachment, req.user, companyId);

    const filePath = join(process.cwd(), ATTACHMENT_UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    // Write audit log
    await this.auditService.writeLog({
      clientId: req.user?.clientId || null,
      companyId,
      userId: req.user?.id || req.user?.userId || null,
      entityType: 'Attachment',
      entityId: attachment.id,
      action: 'DOWNLOAD',
      newValue: { filename: attachment.storedName, size: attachment.fileSize },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.sendFile(filePath);
  }

  @Get(':id/download')
  @RequirePermission('attachments:download')
  async downloadFileById(
    @Param('id') id: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const attachmentId = parseInt(id, 10);
    if (isNaN(attachmentId)) {
      throw new BadRequestException('Invalid attachment ID');
    }

    const attachment = await this.attachmentsService.getAttachment(attachmentId);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : attachment.companyId;

    if (!companyId) {
      throw new BadRequestException('Company context is required');
    }

    await this.checkAttachmentAccess(attachment, req.user, companyId);

    const filePath = this.storageProvider.resolvePath(attachment.storagePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    // Write audit log
    await this.auditService.writeLog({
      clientId: req.user?.clientId || null,
      companyId,
      userId: req.user?.id || req.user?.userId || null,
      entityType: 'Attachment',
      entityId: attachment.id,
      action: 'DOWNLOAD',
      newValue: { filename: attachment.storedName, size: attachment.fileSize },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.sendFile(filePath);
  }
}
