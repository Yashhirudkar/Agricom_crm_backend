import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class AttachmentsService {
  handleFileUpload(file: Express.Multer.File, companyId: number): string {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Return the private URL
    const fileUrl = `/attachments/download/${file.filename}`;
    return fileUrl;
  }
}
