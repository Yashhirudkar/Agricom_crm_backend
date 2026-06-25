import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskComment } from '../models/task-comment.model';
import { TaskCommentHistory } from '../models/task-comment-history.model';
import { TaskCommentMention } from '../models/task-comment-mention.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskCommentRepository {
  constructor(
    @InjectModel(TaskComment)
    private readonly commentModel: typeof TaskComment,
    @InjectModel(TaskCommentHistory)
    private readonly historyModel: typeof TaskCommentHistory,
    @InjectModel(TaskCommentMention)
    private readonly mentionModel: typeof TaskCommentMention,
  ) {}

  async create(
    data: Partial<TaskComment>,
    transaction?: Transaction,
  ): Promise<TaskComment> {
    return this.commentModel.create(data, { transaction });
  }

  async findAllByTask(
    taskId: number,
    clientId: number,
    page = 1,
    limit = 50,
  ): Promise<{ rows: TaskComment[]; count: number }> {
    return this.commentModel.findAndCountAll({
      where: { taskId, clientId, isDeleted: false },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
      ],
      order: [['createdAt', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });
  }

  async findById(id: number, clientId: number): Promise<TaskComment | null> {
    return this.commentModel.findOne({ where: { id, clientId } });
  }

  async update(
    id: number,
    clientId: number,
    content: string,
    transaction?: Transaction,
  ): Promise<[number, TaskComment[]]> {
    return this.commentModel.update(
      { content, isEdited: true },
      { where: { id, clientId }, returning: true, transaction },
    );
  }

  async saveHistory(
    commentId: number,
    clientId: number,
    previousContent: string,
    editedByUserId: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.historyModel.create(
      { commentId, clientId, previousContent, editedByUserId },
      { transaction },
    );
  }

  async saveMentions(
    commentId: number,
    clientId: number,
    userIds: number[],
    transaction?: Transaction,
  ): Promise<void> {
    if (!userIds?.length) return;
    const records = userIds.map((userId) => ({
      commentId,
      clientId,
      userId,
    }));
    await this.mentionModel.bulkCreate(records, {
      ignoreDuplicates: true,
      transaction,
    });
  }

  async softDelete(
    id: number,
    clientId: number,
    deletedByUserId: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.commentModel.update(
      { isDeleted: true, deletedAt: new Date(), deletedByUserId },
      { where: { id, clientId }, transaction },
    );
  }
}
