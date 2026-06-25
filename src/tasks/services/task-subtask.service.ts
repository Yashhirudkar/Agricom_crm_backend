import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models';
import { TaskStatus } from '../models/task-status.model';
import { CreateTaskDto } from '../dto';
import { TasksService } from './tasks.service';

@Injectable()
export class TaskSubtaskService {
  constructor(
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
    @InjectModel(TaskStatus)
    private readonly statusModel: typeof TaskStatus,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  async findAllSubtasks(parentId: number, clientId: number): Promise<Task[]> {
    return this.taskModel.findAll({
      where: { parentTaskId: parentId, clientId, isDeleted: false },
      include: [
        { model: TaskStatus, as: 'status' },
      ],
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    });
  }

  async createSubtask(
    parentId: number,
    clientId: number,
    userId: number,
    dto: CreateTaskDto,
  ): Promise<Task> {
    const parentTask = await this.taskModel.findOne({
      where: { id: parentId, clientId, isDeleted: false },
    });

    if (!parentTask) {
      throw new NotFoundException('Parent task not found');
    }

    dto.parentTaskId = parentId;
    return this.tasksService.create(clientId, userId, dto);
  }

  async updateSubtask(
    parentId: number,
    subtaskId: number,
    clientId: number,
    userId: number,
    dto: any,
  ): Promise<Task> {
    const subtask = await this.taskModel.findOne({
      where: {
        id: subtaskId,
        parentTaskId: parentId,
        clientId,
        isDeleted: false,
      },
    });

    if (!subtask) {
      throw new NotFoundException('Subtask not found under this parent');
    }

    return this.tasksService.update(subtaskId, clientId, userId, dto);
  }

  async deleteSubtask(
    parentId: number,
    subtaskId: number,
    clientId: number,
    userId: number,
  ): Promise<{ success: boolean }> {
    const subtask = await this.taskModel.findOne({
      where: {
        id: subtaskId,
        parentTaskId: parentId,
        clientId,
        isDeleted: false,
      },
    });

    if (!subtask) {
      throw new NotFoundException('Subtask not found under this parent');
    }

    return this.tasksService.delete(subtaskId, clientId, userId);
  }

  async reorderSubtasks(
    parentId: number,
    clientId: number,
    subtaskIds: number[],
  ): Promise<void> {
    const transaction = await this.taskModel.sequelize.transaction();
    try {
      for (let i = 0; i < subtaskIds.length; i++) {
        await this.taskModel.update(
          { displayOrder: i },
          {
            where: { id: subtaskIds[i], parentTaskId: parentId, clientId },
            transaction,
          },
        );
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw new BadRequestException('Failed to reorder subtasks');
    }
  }

  // ── CASCADE: Parent Status → All Subtasks ─────────────────────────────────
  // Called when parent task is updated to a "completed" status.
  // Bulk-sets all child subtask statuses to the same completed status.
  async cascadeStatusToSubtasks(
    parentId: number,
    clientId: number,
    completedStatusId: number,
  ): Promise<void> {
    await this.taskModel.update(
      { statusId: completedStatusId },
      {
        where: {
          parentTaskId: parentId,
          clientId,
          isDeleted: false,
        },
      },
    );
  }

  // ── CASCADE: Parent Archive → All Subtasks ────────────────────────────────
  // Called when parent task is archived or unarchived.
  // Mirrors the archive state to all child subtasks.
  async cascadeArchiveToSubtasks(
    parentId: number,
    clientId: number,
    isArchived: boolean,
    archivedById?: number,
  ): Promise<void> {
    await this.taskModel.update(
      {
        isArchived,
        archivedAt: isArchived ? new Date() : null,
        archivedById: isArchived ? (archivedById ?? null) : null,
      },
      {
        where: {
          parentTaskId: parentId,
          clientId,
          isDeleted: false,
        },
      },
    );
  }

  // ── CASCADE: Parent Delete → All Subtasks ─────────────────────────────────
  // Called when a parent task is soft-deleted.
  // Soft-deletes (marks isDeleted = true) all child subtasks.
  async cascadeDeleteToSubtasks(
    parentId: number,
    clientId: number,
    deletedBy?: number,
  ): Promise<void> {
    await this.taskModel.update(
      {
        isDeleted: true,
        deletedBy: deletedBy ?? null,
      },
      {
        where: {
          parentTaskId: parentId,
          clientId,
          isDeleted: false,
        },
      },
    );

    // Also trigger sequelize paranoid soft-delete (deletedAt)
    await this.taskModel.destroy({
      where: {
        parentTaskId: parentId,
        clientId,
      },
      individualHooks: false,
    });
  }
}
