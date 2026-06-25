import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly baseDir = path.resolve(process.cwd(), 'storage');

  constructor() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Uploads file to local storage directory under the specified relative dir.
   * Returns the relative path for database storage.
   */
  async uploadFile(
    file: Express.Multer.File,
    relativeDir: string,
    filename: string,
  ): Promise<string> {
    const targetDir = path.join(this.baseDir, relativeDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);

    if (file.path && fs.existsSync(file.path)) {
      fs.renameSync(file.path, targetPath);
    } else if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    } else {
      throw new BadRequestException('No file content found to save');
    }

    return path.relative(this.baseDir, targetPath).replace(/\\/g, '/');
  }

  /**
   * Safely deletes file from storage.
   */
  async deleteFile(relativePath: string): Promise<void> {
    const absolutePath = path.join(this.baseDir, relativePath);
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new BadRequestException('Invalid file path');
    }
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }

  /**
   * Resolves the relative path to absolute path for file transfer / download.
   */
  async getAbsoluteFilePath(relativePath: string): Promise<string> {
    const absolutePath = path.join(this.baseDir, relativePath);
    if (!absolutePath.startsWith(this.baseDir)) {
      throw new BadRequestException('Invalid file path');
    }
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }
    return absolutePath;
  }
}
