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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import { AttachmentsService } from '../services/attachments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import * as fs from 'fs';
import { Response } from 'express';

// Ensure uploads dir exists
const uploadDir = './storage/attachments';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
];

@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req: any, file, cb) => {
          const uniqueSuffix = crypto.randomUUID();
          const ext = extname(file.originalname);
          const clientId = req.user?.clientId || 'global';
          cb(null, `client_${clientId}_${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB limit
      },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(new BadRequestException(`File type ${file.mimetype} is not allowed. Allowed types: pdf, jpg, jpeg, png, docx, xlsx.`), false);
        }
        // Double check extension just in case
        const ext = extname(file.originalname).toLowerCase();
        const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx'];
        if (!allowedExts.includes(ext)) {
          return cb(new BadRequestException(`File extension ${ext} is not allowed.`), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const companyId = req.headers['x-company-id']
      ? parseInt(req.headers['x-company-id'] as string, 10)
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

  @Get('download/:filename')
  downloadFile(@Param('filename') filename: string, @Request() req, @Res() res: Response) {
    // Basic path traversal protection
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }

    // Verify ownership
    const isSuper = req.user?.type === 'super_admin' || req.user?.clientId === null;
    
    if (!isSuper) {
      const parts = filename.split('_');
      if (parts.length >= 2 && parts[0] === 'client') {
        const fileClientId = parts[1];
        if (fileClientId !== 'global' && fileClientId !== String(req.user.clientId)) {
          throw new ForbiddenException('Access denied to this file');
        }
      } else {
        // Legacy or malformed filename, deny for non-super admin
        throw new ForbiddenException('Cannot verify file ownership');
      }
    }

    const filePath = join(process.cwd(), uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(filePath);
  }
}
