import { Injectable } from '@nestjs/common';
import { IStorageProvider } from './task-storage.provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    // Placeholder: swap for S3/GCS/Azure in production
    return '/uploads/' + fileName;
  }

  async deleteFile(fileUrl: string): Promise<boolean> {
    // Placeholder: implement actual file deletion in production
    return true;
  }

  validateFile(mimeType: string, size: number): boolean {
    const maxSize = 50 * 1024 * 1024; // 50MB
    return size <= maxSize;
  }
}
