import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskTimeLog } from '../models/task-time-log.model';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskTimeLogRepository {
  constructor(
    @InjectModel(TaskTimeLog)
    private readonly model: typeof TaskTimeLog,
  ) {}

  async create(
    data: Partial<TaskTimeLog>,
    transaction?: Transaction,
  ): Promise<TaskTimeLog> {
    return this.model.create(data, { transaction });
  }

  async findActiveSession(
    taskId: number,
    userId: number,
    clientId: number,
  ): Promise<TaskTimeLog | null> {
    return this.model.findOne({
      where: { taskId, userId, clientId, endedAt: null, isManual: false },
    });
  }

  async update(
    id: number,
    data: Partial<TaskTimeLog>,
    transaction?: Transaction,
  ): Promise<[number, TaskTimeLog[]]> {
    return this.model.update(data, {
      where: { id },
      returning: true,
      transaction,
    });
  }

  async findAllByTask(
    taskId: number,
    clientId: number,
  ): Promise<TaskTimeLog[]> {
    return this.model.findAll({
      where: { taskId, clientId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async sumMinutesByTask(taskId: number, clientId: number): Promise<number> {
    const result = await this.model.sum('durationMinutes', {
      where: { taskId, clientId },
    });
    return result || 0;
  }
}
