import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskChecklist } from '../models/task-checklist.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskChecklistRepository {
  constructor(
    @InjectModel(TaskChecklist)
    private readonly model: typeof TaskChecklist,
  ) {}

  async create(
    data: Partial<TaskChecklist>,
    transaction?: Transaction,
  ): Promise<TaskChecklist> {
    return this.model.create(data, { transaction });
  }

  async findAllByTask(
    taskId: number,
    clientId: number,
  ): Promise<TaskChecklist[]> {
    return this.model.findAll({
      where: { taskId, clientId },
      include: [
        {
          model: User,
          as: 'completedBy',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['orderIndex', 'ASC']],
    });
  }

  async findById(id: number, clientId: number): Promise<TaskChecklist | null> {
    return this.model.findOne({ where: { id, clientId } });
  }

  async update(
    id: number,
    clientId: number,
    data: Partial<TaskChecklist>,
    transaction?: Transaction,
  ): Promise<[number, TaskChecklist[]]> {
    return this.model.update(data, {
      where: { id, clientId },
      returning: true,
      transaction,
    });
  }

  async delete(
    id: number,
    clientId: number,
    transaction?: Transaction,
  ): Promise<number> {
    return this.model.destroy({ where: { id, clientId }, transaction });
  }

  async countByTask(taskId: number, clientId: number): Promise<number> {
    return this.model.count({ where: { taskId, clientId } });
  }
}
