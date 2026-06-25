import { Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { InjectModel } from '@nestjs/sequelize';
import { Task } from '../models/task.model';
import { TaskTemplateRepository } from '../repositories/task-template.repository';
import { TaskRepository } from '../repositories/task.repository';
import { TaskActivityService } from './task-activity.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CloneTemplateDto,
} from '../dto/task-template.dto';

@Injectable()
export class TaskTemplateService {
  constructor(
    private readonly repo: TaskTemplateRepository,
    private readonly taskRepo: TaskRepository,
    private readonly activityService: TaskActivityService,
    private readonly sequelize: Sequelize,
    @InjectModel(Task) private readonly taskModel: typeof Task,
  ) {}

  async create(clientId: number, userId: number, dto: CreateTemplateDto) {
    return this.repo.create({
      clientId,
      title: dto.title,
      description: dto.description ?? null,
      createdByUserId: userId,
    });
  }

  async findAll(clientId: number) {
    return this.repo.findAll(clientId);
  }

  async findOne(clientId: number, templateId: number) {
    const t = await this.repo.findById(templateId, clientId);
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async update(clientId: number, templateId: number, dto: UpdateTemplateDto) {
    const t = await this.repo.findById(templateId, clientId);
    if (!t) throw new NotFoundException('Template not found');
    const [, [updated]] = await this.repo.update(templateId, clientId, dto);
    return updated;
  }

  async delete(clientId: number, templateId: number) {
    const t = await this.repo.findById(templateId, clientId);
    if (!t) throw new NotFoundException('Template not found');
    await this.repo.delete(templateId, clientId);
    return { success: true };
  }

  async cloneIntoTask(
    clientId: number,
    templateId: number,
    userId: number,
    dto: CloneTemplateDto,
  ) {
    const template = await this.repo.findById(templateId, clientId);
    if (!template) throw new NotFoundException('Template not found');

    const items = await this.repo.getItems(templateId);

    const transaction = await this.sequelize.transaction();
    try {
      // Create parent task from template
      const task = await this.taskRepo.create(
        {
          clientId,
          title: dto.title ?? template.title,
          description: template.description ?? null,
          createdById: userId,
          statusId: dto.statusId ?? null,
          priorityId: dto.priorityId ?? null,
          completionPercentage: 0,
        },
        transaction,
      );

      // Create subtasks from template items
      for (const item of items) {
        await this.taskRepo.create(
          {
            clientId,
            title: item.title,
            description: item.description ?? null,
            parentTaskId: task.id,
            estimatedMinutes: item.estimatedMinutes ?? null,
            createdById: userId,
            statusId: dto.statusId ?? null,
            priorityId: dto.priorityId ?? null,
            completionPercentage: 0,
          },
          transaction,
        );
      }

      await this.activityService.logEvent(
        task.id,
        clientId,
        userId,
        'created_from_template',
        transaction,
      );
      await transaction.commit();

      return this.taskModel.findOne({ where: { id: task.id, clientId } });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}
