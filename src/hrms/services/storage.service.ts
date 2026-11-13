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
    await fs.promises.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, filename);

    let sourceFileExists = false;
    if (file.path) {
      try {
        await fs.promises.access(file.path);
        sourceFileExists = true;
      } catch (error) {
        if (
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        ) {
          throw error;
        }
      }
    }

    if (sourceFileExists && file.path) {
      await fs.promises.rename(file.path, targetPath);
    } else if (file.buffer) {
      await fs.promises.writeFile(targetPath, file.buffer);
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
    try {
      await fs.promises.unlink(absolutePath);
    } catch (error) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
      ) {
        throw error;
      }
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
    try {
      await fs.promises.access(absolutePath);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new NotFoundException('File not found');
      }
      throw error;
    }
    return absolutePath;
  }
}
