import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider } from './storage.provider';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir = './storage/attachments';

  get diskName(): string {
    return 'local';
  }

  resolvePath(filename: string): string {
    return join(process.cwd(), this.uploadDir, filename);
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = this.resolvePath(filename);
    try {
      await fs.promises.unlink(filePath);
      this.logger.log(`Deleted file: ${filePath}`);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      this.logger.error(`Error deleting file ${filePath}`, error);
    }
  }
}
