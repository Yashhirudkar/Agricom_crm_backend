import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Attachment } from '../models/attachment.model';
import { STORAGE_PROVIDER, StorageProvider } from '../providers/storage.provider';
import { extname } from 'path';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment)
    private readonly attachmentModel: typeof Attachment,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async createAttachment(
    file: Express.Multer.File,
    uploadedBy: number,
    companyId: number,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const attachment = await this.attachmentModel.create({
      originalName: file.originalname,
      storedName: file.filename,
      extension: extname(file.originalname).toLowerCase(),
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: file.filename, // we just store the relative filename
      storageDisk: this.storageProvider.diskName,
      uploadedBy,
      companyId,
    });

    return attachment;
  }

  async getAttachment(id: number): Promise<Attachment> {
    const attachment = await this.attachmentModel.findByPk(id);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  async deleteAttachment(id: number): Promise<void> {
    const attachment = await this.attachmentModel.findByPk(id);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Delete from physical storage
    await this.storageProvider.deleteFile(attachment.storagePath);

    // Delete from DB (paranoid delete)
    await attachment.destroy();
  }

  // Legacy support for backward compatibility
  handleFileUpload(file: Express.Multer.File, companyId: number): string {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Return the private URL
    const fileUrl = `/attachments/download/${file.filename}`;
    return fileUrl;
  }
}
