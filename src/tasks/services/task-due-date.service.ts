import { Injectable } from '@nestjs/common';
import { Task } from '../models/task.model';

export interface DueDateStatus {
  dueStatus: string;
  dueLabel: string;
  overdueDays: number;
  completionDelayDays: number;
}

@Injectable()
export class TaskDueDateService {
  computeDueStatus(task: Task, isStatusCompleted: boolean): DueDateStatus {
    const result: DueDateStatus = {
      dueStatus: 'NO_DUE_DATE',
      dueLabel: '',
      overdueDays: 0,
      completionDelayDays: 0,
    };

    if (!task.dueDate) {
      return result;
    }

    const now = new Date();
    const dueDate = new Date(task.dueDate);

    now.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    if (isStatusCompleted) {
      result.dueStatus = 'COMPLETED';
      if (task.completedAt) {
        const completedAt = new Date(task.completedAt);
        completedAt.setHours(0, 0, 0, 0);

        if (completedAt > dueDate) {
          const diff = completedAt.getTime() - dueDate.getTime();
          result.completionDelayDays = Math.ceil(diff / (1000 * 3600 * 24));
          result.dueLabel = `Completed ${result.completionDelayDays} days late`;
        } else {
          const diff = dueDate.getTime() - completedAt.getTime();
          const earlyDays = Math.ceil(diff / (1000 * 3600 * 24));
          result.dueLabel = `Completed ${earlyDays} days early`;
        }
      } else {
        result.dueLabel = 'Completed';
      }
      return result;
    }

    if (now > dueDate) {
      result.dueStatus = 'OVERDUE';
      const diff = now.getTime() - dueDate.getTime();
      result.overdueDays = Math.ceil(diff / (1000 * 3600 * 24));
      result.dueLabel = `Overdue by ${result.overdueDays} days`;
    } else if (now.getTime() === dueDate.getTime()) {
      result.dueStatus = 'DUE_TODAY';
      result.dueLabel = 'Due today';
    } else {
      result.dueStatus = 'FUTURE';
      const diff = dueDate.getTime() - now.getTime();
      const futureDays = Math.ceil(diff / (1000 * 3600 * 24));
      result.dueLabel = `Due in ${futureDays} days`;
    }

    return result;
  }
}
