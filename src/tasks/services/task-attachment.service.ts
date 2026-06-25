import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskAttachmentRepository } from '../repositories/task-attachment.repository';
import { CreateTaskAttachmentDto } from '../dto/task-attachment.dto';
import { Task } from '../models';
import { InjectModel } from '@nestjs/sequelize';
import { IStorageProvider } from './task-storage.provider.interface';

@Injectable()
export class TaskAttachmentService {
  // Assume storageProvider is injected via a custom provider in tasks.module
  constructor(
    private readonly attachmentRepo: TaskAttachmentRepository,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(Task) private readonly taskModel: typeof Task,
    @Inject('IStorageProvider')
    private readonly storageProvider: IStorageProvider,
  ) {}

  async create(
    taskId: number,
    clientId: number,
    userId: number,
    dto: CreateTaskAttachmentDto,
    fileBuffer?: Buffer, // Pass file buffer if uploading directly
  ) {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (!this.storageProvider.validateFile(dto.fileType, dto.fileSize)) {
      throw new BadRequestException('Invalid file type or size exceeds limit');
    }

    let finalFileUrl = dto.fileUrl;
    if (fileBuffer) {
      finalFileUrl = await this.storageProvider.uploadFile(
        fileBuffer,
        dto.fileName,
        dto.fileType,
      );
    }

    const attachment = await this.attachmentRepo.create({
      taskId,
      clientId,
      userId,
      fileName: dto.fileName,
      fileUrl: finalFileUrl,
      fileType: dto.fileType,
      fileSize: dto.fileSize,
    });

    // Touch task updatedAt to show activity
    await task.changed('updatedAt', true);
    await task.save();

    this.eventEmitter.emit('task.attachment.created', {
      taskId,
      clientId,
      userId,
      attachmentId: attachment.id,
    });
    return attachment;
  }

  async findAll(taskId: number, clientId: number) {
    return this.attachmentRepo.findAllByTask(taskId, clientId);
  }

  async delete(
    id: number,
    taskId: number,
    clientId: number,
    userId: number,
    isManager: boolean = false,
  ) {
    const attachment = await this.attachmentRepo.findById(id, clientId);
    if (!attachment || attachment.taskId !== taskId)
      throw new NotFoundException('Attachment not found');

    // Only uploader or manager can delete
    if (attachment.userId !== userId && !isManager) {
      throw new ForbiddenException(
        'You do not have permission to delete this attachment',
      );
    }

    await this.storageProvider.deleteFile(attachment.fileUrl);
    await this.attachmentRepo.delete(id, clientId);
    return { success: true };
  }
}
