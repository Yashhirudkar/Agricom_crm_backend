import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { TaskCommentRepository } from '../repositories/task-comment.repository';
import {
  CreateTaskCommentDto,
  UpdateTaskCommentDto,
} from '../dto/task-comment.dto';
import { Task } from '../models';
import { InjectModel } from '@nestjs/sequelize';

@Injectable()
export class TaskCommentService {
  constructor(
    private readonly commentRepo: TaskCommentRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  async create(
    taskId: number,
    clientId: number,
    userId: number,
    dto: CreateTaskCommentDto,
  ) {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const transaction = await this.sequelize.transaction();
    try {
      const comment = await this.commentRepo.create(
        {
          taskId,
          clientId,
          userId,
          content: dto.content,
          parentCommentId: dto.parentCommentId ?? null,
        },
        transaction,
      );

      // Save mentions
      if (dto.mentioneduserIds?.length) {
        await this.commentRepo.saveMentions(
          comment.id,
          clientId,
          dto.mentioneduserIds,
          transaction,
        );
      }

      await task.changed('updatedAt', true);
      await task.save({ transaction });

      await transaction.commit();

      this.eventEmitter.emit('comment.created', {
        taskId,
        clientId,
        userId,
        commentId: comment.id,
      });
      return comment;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async findAll(taskId: number, clientId: number, page = 1, limit = 50) {
    const { rows, count } = await this.commentRepo.findAllByTask(
      taskId,
      clientId,
      page,
      limit,
    );
    return {
      data: rows,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
  }

  async update(
    id: number,
    taskId: number,
    clientId: number,
    userId: number,
    dto: UpdateTaskCommentDto,
  ) {
    const comment = await this.commentRepo.findById(id, clientId);
    if (!comment || comment.taskId !== taskId)
      throw new NotFoundException('Comment not found');
    if (comment.userId !== userId)
      throw new ForbiddenException('You can only edit your own comments');

    const transaction = await this.sequelize.transaction();
    try {
      // Save history before update
      await this.commentRepo.saveHistory(
        id,
        clientId,
        comment.content,
        userId,
        transaction,
      );
      const [, [updatedComment]] = await this.commentRepo.update(
        id,
        clientId,
        dto.content,
        transaction,
      );

      // Re-save mentions if provided
      if (dto.mentioneduserIds?.length) {
        await this.commentRepo.saveMentions(
          id,
          clientId,
          dto.mentioneduserIds,
          transaction,
        );
      }

      await transaction.commit();

      this.eventEmitter.emit('comment.updated', {
        commentId: id,
        taskId,
        clientId,
        userId,
      });
      return updatedComment;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async delete(
    id: number,
    taskId: number,
    clientId: number,
    userId: number,
  ) {
    const comment = await this.commentRepo.findById(id, clientId);
    if (!comment || comment.taskId !== taskId)
      throw new NotFoundException('Comment not found');
    if (comment.userId !== userId)
      throw new ForbiddenException('You can only delete your own comments');

    await this.commentRepo.softDelete(id, clientId, userId);

    this.eventEmitter.emit('comment.deleted', {
      commentId: id,
      taskId,
      clientId,
      userId,
    });
    return { success: true };
  }
}
