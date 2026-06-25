import { Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { InjectModel } from '@nestjs/sequelize';
import { Task, TaskSequence } from '../models';
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
    @InjectModel(TaskSequence) private readonly sequenceModel: typeof TaskSequence,
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
      // 1. Generate Task Code safely for parent task
      let sequence = await this.sequenceModel.findOne({
        where: { clientId, modulePrefix: 'TASK' },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (!sequence) {
        sequence = await this.sequenceModel.create(
          { clientId, modulePrefix: 'TASK', currentSequence: 0 },
          { transaction },
        );
      }

      const newSeq = sequence.currentSequence + 1;
      await sequence.update({ currentSequence: newSeq }, { transaction });
      const parentTaskCode = `TASK-${newSeq}`;

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
          taskCode: parentTaskCode,
        },
        transaction,
      );

      // Create subtasks from template items
      let subtaskIndex = 0;
      for (const item of items) {
        const getLetterSuffix = (num: number): string => {
          let temp = num;
          let suffix = '';
          while (temp >= 0) {
            suffix = String.fromCharCode((temp % 26) + 65) + suffix;
            temp = Math.floor(temp / 26) - 1;
          }
          return suffix;
        };
        const suffix = getLetterSuffix(subtaskIndex++);
        const subtaskCode = `${parentTaskCode}-${suffix}`;

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
            taskCode: subtaskCode,
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
