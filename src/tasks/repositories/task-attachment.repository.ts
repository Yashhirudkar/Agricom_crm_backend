import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { TaskAttachment } from '../models';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskAttachmentRepository {
  constructor(
    @InjectModel(TaskAttachment)
    private readonly attachmentModel: typeof TaskAttachment,
  ) {}

  async create(data: Partial<TaskAttachment>): Promise<TaskAttachment> {
    return this.attachmentModel.create(data);
  }

  async findAllByTask(
    taskId: number,
    clientId: number,
  ): Promise<TaskAttachment[]> {
    return this.attachmentModel.findAll({
      where: { taskId, clientId },
      include: [
        {
          model: User,
          as: 'uploadedBy',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
      ],
      order: [['uploadedAt', 'DESC']],
    });
  }

  async findById(id: number, clientId: number): Promise<TaskAttachment | null> {
    return this.attachmentModel.findOne({ where: { id, clientId } });
  }

  async delete(id: number, clientId: number): Promise<number> {
    return this.attachmentModel.destroy({ where: { id, clientId } });
  }
}
