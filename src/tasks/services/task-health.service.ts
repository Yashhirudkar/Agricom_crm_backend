import { Injectable } from '@nestjs/common';
import { Task } from '../models/task.model';
import { TaskDependency } from '../models/task-dependency.model';
import { TaskStatus } from '../models/task-status.model';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';

export enum TaskHealthState {
  HEALTHY = 'HEALTHY',
  AT_RISK = 'AT_RISK',
  DELAYED = 'DELAYED',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
}

@Injectable()
export class TaskHealthService {
  constructor(
    @InjectModel(TaskDependency)
    private readonly taskDependencyModel: typeof TaskDependency,
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
  ) {}

  async computeHealth(
    task: Task,
    isStatusCompleted: boolean,
  ): Promise<TaskHealthState> {
    if (isStatusCompleted) {
      return TaskHealthState.COMPLETED;
    }

    // Check if blocked
    const blockingDeps = await this.taskDependencyModel.findAll({
      where: {
        taskId: task.id,
        dependencyType: 'BLOCKED_BY', // assuming 'BLOCKED_BY' means this task is blocked by dependsOnTaskId
      },
      include: [
        {
          model: Task,
          as: 'dependsOnTask',
          include: [{ model: TaskStatus, required: false }],
        },
      ],
    });

    const isBlocked = blockingDeps.some(
      (dep) => !dep.dependsOnTask?.status?.isCompleted,
    );

    if (isBlocked) {
      return TaskHealthState.BLOCKED;
    }

    if (task.dueDate) {
      const now = new Date();
      const dueDate = new Date(task.dueDate);

      // Reset times for accurate day calculation
      now.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);

      if (now > dueDate) {
        return TaskHealthState.DELAYED;
      }

      const timeDiff = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (daysDiff <= 2) {
        // Less than or equal to 2 days
        return TaskHealthState.AT_RISK;
      }
    }

    return TaskHealthState.HEALTHY;
  }

  computeHealthSync(task: Task, isStatusCompleted: boolean): TaskHealthState {
    if (isStatusCompleted) {
      return TaskHealthState.COMPLETED;
    }

    if (task.dueDate) {
      const now = new Date();
      const dueDate = new Date(task.dueDate);

      // Reset times for accurate day calculation
      now.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);

      if (now > dueDate) {
        return TaskHealthState.DELAYED;
      }

      const timeDiff = dueDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (daysDiff <= 2) {
        // Less than or equal to 2 days
        return TaskHealthState.AT_RISK;
      }
    }

    return TaskHealthState.HEALTHY;
  }
}
