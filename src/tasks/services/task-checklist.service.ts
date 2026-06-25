import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models/task.model';
import { TaskChecklistRepository } from '../repositories/task-checklist.repository';
import {
  CreateChecklistItemDto,
  ReorderChecklistDto,
  UpdateChecklistItemDto,
} from '../dto/task-checklist.dto';
import { TaskActivityService } from './task-activity.service';

@Injectable()
export class TaskChecklistService {
  constructor(
    private readonly repo: TaskChecklistRepository,
    private readonly activityService: TaskActivityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  private async assertTask(taskId: number, clientId: number): Promise<Task> {
    const task = await this.taskModel.findOne({
      where: { id: taskId, clientId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(
    taskId: number,
    clientId: number,
    userId: number,
    dto: CreateChecklistItemDto,
  ) {
    await this.assertTask(taskId, clientId);
    const count = await this.repo.countByTask(taskId, clientId);
    const item = await this.repo.create({
      taskId,
      clientId,
      title: dto.title,
      orderIndex: dto.orderIndex ?? count,
      isCompleted: false,
    });
    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      'checklist_item_added',
    );
    return item;
  }

  async findAll(taskId: number, clientId: number) {
    await this.assertTask(taskId, clientId);
    return this.repo.findAllByTask(taskId, clientId);
  }

  async update(
    taskId: number,
    clientId: number,
    checklistId: number,
    userId: number,
    dto: UpdateChecklistItemDto,
  ) {
    const item = await this.repo.findById(checklistId, clientId);
    if (!item || item.taskId !== taskId)
      throw new NotFoundException('Checklist item not found');
    const [, [updated]] = await this.repo.update(checklistId, clientId, dto);
    return updated;
  }

  async toggle(
    taskId: number,
    clientId: number,
    checklistId: number,
    userId: number,
  ) {
    const item = await this.repo.findById(checklistId, clientId);
    if (!item || item.taskId !== taskId)
      throw new NotFoundException('Checklist item not found');

    const nowCompleted = !item.isCompleted;
    const updateData: any = {
      isCompleted: nowCompleted,
      completedByUserId: nowCompleted ? userId : null,
      completedAt: nowCompleted ? new Date() : null,
    };

    const [, [updated]] = await this.repo.update(
      checklistId,
      clientId,
      updateData,
    );

    this.eventEmitter.emit('checklist.toggled', {
      taskId,
      clientId,
      checklistId,
      userId,
      isCompleted: nowCompleted,
    });
    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      nowCompleted ? 'checklist_item_completed' : 'checklist_item_uncompleted',
    );
    return updated;
  }

  async reorder(taskId: number, clientId: number, dto: ReorderChecklistDto) {
    await this.assertTask(taskId, clientId);
    const transaction = await this.sequelize.transaction();
    try {
      for (let i = 0; i < dto.orderedIds.length; i++) {
        const id = dto.orderedIds[i];
        await this.repo.update(id, clientId, { orderIndex: i }, transaction);
      }
      await transaction.commit();
      return this.repo.findAllByTask(taskId, clientId);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async delete(
    taskId: number,
    clientId: number,
    checklistId: number,
    userId: number,
  ) {
    const item = await this.repo.findById(checklistId, clientId);
    if (!item || item.taskId !== taskId)
      throw new NotFoundException('Checklist item not found');
    await this.repo.delete(checklistId, clientId);
    await this.activityService.logEvent(
      taskId,
      clientId,
      userId,
      'checklist_item_deleted',
    );
    return { success: true };
  }
}
