import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Task } from '../models/task.model';
import { TaskAssignee } from '../models/task-assignee.model';

import { TaskStatus } from '../models/task-status.model';

export type TaskPreset =
  | 'all_tasks'
  | 'my_tasks'
  | 'assigned_to_me'
  | 'assigned_by_me'
  | 'created_by_me'
  | 'watching'
  | 'open_tasks'
  | 'completed_tasks'
  | 'overdue_tasks'
  | 'archived_tasks'
  | 'high_priority_tasks'
  | 'team_tasks';

@Injectable()
export class TaskViewService {
  constructor(
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
  ) {}

  buildPresetWhereClause(preset: TaskPreset, userId: number): any {
    const where: any = {};
    const include: any[] = [];
    const now = new Date();

    switch (preset) {
      case 'all_tasks':
        // Just return all non-archived tasks by default
        break;

      case 'my_tasks':
        where[Op.or] = [
          { ownerId: userId },
          { createdById: userId }
        ];
        break;

      case 'assigned_to_me':
        include.push({
          model: TaskAssignee,
          where: { userId: userId },
          required: true,
        });
        break;

      case 'assigned_by_me':
        include.push({
          model: TaskAssignee,
          where: { assignedById: userId },
          required: true,
        });
        break;

      case 'watching':
        // TaskFollower table does not exist in DB yet - return empty include
        where['id'] = -1; // no results until table is created
        break;

      case 'open_tasks':
        include.push({
          model: TaskStatus,
          where: { isCompleted: false },
          required: true,
        });
        break;

      case 'completed_tasks':
        include.push({
          model: TaskStatus,
          where: { isCompleted: true },
          required: true,
        });
        break;

      case 'overdue_tasks':
        where.dueDate = { [Op.lt]: now };
        include.push({
          model: TaskStatus,
          where: { isCompleted: false },
          required: true,
        });
        break;

      case 'archived_tasks':
        where.isArchived = true;
        break;

      // Add other presets as needed
    }

    // Default to not archived unless specifically requested
    if (preset !== 'archived_tasks') {
      where.isArchived = false;
    }

    return { where, include };
  }

  async findAll(
    clientId: number,
    userId: number,
    preset: TaskPreset,
    page = 1,
    limit = 50,
  ) {
    const { where, include } = this.buildPresetWhereClause(preset, userId);
    where.clientId = clientId;

    const offset = (page - 1) * limit;

    const { rows, count } = await this.taskModel.findAndCountAll({
      where,
      include: [...include, { model: TaskStatus, required: false }],
      limit,
      offset,
      order: [
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      distinct: true,
    });

    return {
      data: rows,
      meta: {
        totalCount: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
      },
    };
  }
}
