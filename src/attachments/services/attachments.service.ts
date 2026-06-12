import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class AttachmentsService {
  handleFileUpload(file: Express.Multer.File, companyId: number): string {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // File is saved by multer in /public/uploads
    // Return the public URL
    const fileUrl = `/public/uploads/${file.filename}`;
    return fileUrl;
  }
}
