import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models';
import { CreateTaskDto } from '../dto';
import { TasksService } from './tasks.service';
import { Transaction } from 'sequelize';

@Injectable()
export class TaskSubtaskService {
  constructor(
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
    private readonly tasksService: TasksService,
  ) {}

  async findAllSubtasks(parentId: number, clientId: number): Promise<Task[]> {
    // Basic infinite depth or up to 3 levels could be done with a recursive CTE or just nested eager loading
    return this.taskModel.findAll({
      where: { parentTaskId: parentId, clientId, isDeleted: false },
      order: [['id', 'ASC']], // Or by a displayOrder if added
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
    // Assumes we added displayOrder to Task model. Wait, user said "Add: displayOrder field in database. Do NOT rely on createdAt sorting."
    // We will add it to the migration and model shortly.
    const transaction = await this.taskModel.sequelize.transaction();
    try {
      for (let i = 0; i < subtaskIds.length; i++) {
        await this.taskModel.update(
          { displayOrder: i }, // we will add this property
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
}
