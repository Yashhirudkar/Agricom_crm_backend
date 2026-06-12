import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as crypto from 'crypto';
import { AttachmentsService } from '../services/attachments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

// Ensure uploads dir exists
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = crypto.randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB limit
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @Request() req) {
    const companyId = req.headers['x-company-id']
      ? parseInt(req.headers['x-company-id'], 10)
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
}
