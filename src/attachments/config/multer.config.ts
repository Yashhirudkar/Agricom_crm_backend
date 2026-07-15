import { diskStorage } from 'multer';
import { extname } from 'path';
import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

export const ATTACHMENT_UPLOAD_DIR = './storage/attachments';

// Ensure uploads dir exists
if (!fs.existsSync(ATTACHMENT_UPLOAD_DIR)) {
  fs.mkdirSync(ATTACHMENT_UPLOAD_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
];

export const getAttachmentMulterConfig = () => ({
  storage: diskStorage({
    destination: ATTACHMENT_UPLOAD_DIR,
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
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new BadRequestException(
          `File type ${file.mimetype} is not allowed. Allowed types: pdf, jpg, jpeg, png, docx, xlsx.`,
        ),
        false,
      );
    }
    // Double check extension just in case
    const ext = extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx'];
    if (!allowedExts.includes(ext)) {
      return cb(
        new BadRequestException(`File extension ${ext} is not allowed.`),
        false,
      );
    }
    cb(null, true);
  },
});
