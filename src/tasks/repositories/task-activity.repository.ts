import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { TaskActivity } from '../models';

@Injectable()
export class TaskActivityRepository {
  constructor(
    @InjectModel(TaskActivity)
    private readonly activityModel: typeof TaskActivity,
  ) {}

  async createLog(
    data: Partial<TaskActivity>,
    transaction?: Transaction,
  ): Promise<TaskActivity> {
    return this.activityModel.create(data, { transaction });
  }

  async bulkCreateLogs(
    data: Partial<TaskActivity>[],
    transaction?: Transaction,
  ): Promise<TaskActivity[]> {
    return this.activityModel.bulkCreate(data, { transaction });
  }

  async findAndCountByTaskId(
    taskId: number,
    clientId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ rows: TaskActivity[]; count: number }> {
    const { User } = require('../../users/models/user.model');

    return this.activityModel.findAndCountAll({
      where: { taskId, clientId },
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
  }
}
