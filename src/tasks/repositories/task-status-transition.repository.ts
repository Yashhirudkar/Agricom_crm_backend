import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskStatusTransition } from '../models/task-status-transition.model';
import { TaskStatus } from '../models/task-status.model';

@Injectable()
export class TaskStatusTransitionRepository {
  constructor(
    @InjectModel(TaskStatusTransition)
    private readonly model: typeof TaskStatusTransition,
  ) {}

  async findAllByClient(clientId: number): Promise<TaskStatusTransition[]> {
    return this.model.findAll({
      where: { clientId },
      include: [
        { model: TaskStatus, as: 'fromStatus' },
        { model: TaskStatus, as: 'toStatus' },
      ],
    });
  }

  async isAllowed(
    clientId: number,
    fromStatusId: number,
    toStatusId: number,
  ): Promise<boolean> {
    const rules = await this.model.count({ where: { clientId } });
    if (rules === 0) return true; // No rules configured → allow all

    const match = await this.model.findOne({
      where: { clientId, fromStatusId, toStatusId },
    });
    return !!match;
  }

  async create(
    data: Partial<TaskStatusTransition>,
    transaction?: Transaction,
  ): Promise<TaskStatusTransition> {
    return this.model.create(data, { transaction });
  }

  async delete(id: number, clientId: number): Promise<number> {
    return this.model.destroy({ where: { id, clientId } });
  }
}
