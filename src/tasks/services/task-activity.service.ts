import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Task } from '../models';
import { TaskActivityRepository } from '../repositories/task-activity.repository';
import { Transaction } from 'sequelize';

@Injectable()
export class TaskActivityService {
  constructor(private readonly activityRepo: TaskActivityRepository) {}


  /**
   * Compares old and new task states to generate field-level diff logs.
   */
  async generateUpdateLogs(
    oldTask: Task,
    newTask: Partial<Task>,
    clientId: number,
    userId: number,
    transaction?: Transaction,
  ): Promise<void> {
    const logs = [];

    // Keys we care about diffing
    const fieldsToTrack = [
      'statusId',
      'priorityId',
      'title',
      'description',
      'dueDate',
      'estimatedMinutes',
      'actualMinutes',
      'completionPercentage',
      'isArchived',
      'parentTaskId',
    ];

    for (const field of fieldsToTrack) {
      if (newTask[field] !== undefined && oldTask[field] !== newTask[field]) {
        // Special mapping for field names
        let actionType = 'updated';
        if (field === 'statusId') actionType = 'status_changed';
        else if (field === 'priorityId') actionType = 'priority_changed';
        else if (field === 'isArchived')
          actionType = newTask[field] ? 'archived' : 'unarchived';

        logs.push({
          clientId,
          taskId: oldTask.id,
          userId,
          actionType,
          fieldName: field,
          oldValue: oldTask[field] !== null ? String(oldTask[field]) : null,
          newValue: newTask[field] !== null ? String(newTask[field]) : null,
        });
      }
    }

    if (logs.length > 0) {
      await this.activityRepo.bulkCreateLogs(logs, transaction);
    }
  }

  async logEvent(
    taskId: number,
    clientId: number,
    userId: number | null,
    actionType: string,
    transaction?: Transaction,
  ) {
    await this.activityRepo.createLog(
      {
        taskId,
        clientId,
        userId,
        actionType,
      },
      transaction,
    );
  }

  async getActivitiesForTask(
    taskId: number,
    clientId: number,
    page: number = 1,
    limit: number = 20,
  ) {
    const { rows, count } = await this.activityRepo.findAndCountByTaskId(
      taskId,
      clientId,
      page,
      limit,
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        actionType: row.actionType,
        fieldName: row.fieldName,
        oldValue: row.oldValue,
        newValue: row.newValue,
        createdAt: row.createdAt,
        actor: row.user
          ? {
              id: row.user.id,
              name: (row.user as any).name,
              email: (row.user as any).email,
            }
          : null,
      })),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
}
