import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskRepository, TaskQueryRepository } from '../repositories';
import { TaskActivityService } from './task-activity.service';
import { TaskDueDateService } from './task-due-date.service';
import { TaskHealthService, TaskHealthState } from './task-health.service';
import { TaskSubtaskService } from './task-subtask.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  ArchiveTaskDto,
  TaskQueryDto,
} from '../dto';
import { TaskSequence, TaskStatus, TaskPriority, Task } from '../models';
import { User } from '../../users/models/user.model';
import { Op } from 'sequelize';

@Injectable()
export class TasksService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly taskRepo: TaskRepository,
    private readonly taskQueryRepo: TaskQueryRepository,
    private readonly activityService: TaskActivityService,
    private readonly dueDateService: TaskDueDateService,
    private readonly healthService: TaskHealthService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => TaskSubtaskService))
    private readonly subtaskService: TaskSubtaskService,
    @InjectModel(TaskSequence)
    private readonly sequenceModel: typeof TaskSequence,
    @InjectModel(TaskStatus)
    private readonly statusModel: typeof TaskStatus,
    @InjectModel(TaskPriority)
    private readonly priorityModel: typeof TaskPriority,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
  ) {}

  async findAll(clientId: number, userId: number, query: TaskQueryDto) {
    // Inject userId into query for presets that need it
    (query as any).userId = userId;
    const result = await this.taskQueryRepo.findAndCountAll(clientId, query);

    // Enrich with sync health/due status
    const enrichedData = result.data.map((task) => {
      const isCompleted = task.status?.isCompleted || false;
      const dueData = this.dueDateService.computeDueStatus(task, isCompleted);
      const healthStatus = this.healthService.computeHealthSync(
        task,
        isCompleted,
      );

      return {
        ...task.toJSON(),
        dueStatus: dueData.dueStatus,
        dueLabel: dueData.dueLabel,
        overdueDays: dueData.overdueDays,
        completionDelayDays: dueData.completionDelayDays,
        healthStatus,
      };
    });

    return { ...result, data: enrichedData };
  }

  async findOne(id: number, clientId: number) {
    const task = await this.taskQueryRepo.getDetailHydrated(id, clientId);
    if (!task) throw new NotFoundException('Task not found');

    const isCompleted = task.status?.isCompleted || false;
    const dueData = this.dueDateService.computeDueStatus(task, isCompleted);
    const healthStatus = await this.healthService.computeHealth(
      task,
      isCompleted,
    );

    return {
      ...task.toJSON(),
      dueStatus: dueData.dueStatus,
      dueLabel: dueData.dueLabel,
      overdueDays: dueData.overdueDays,
      completionDelayDays: dueData.completionDelayDays,
      healthStatus,
    };
  }

  async getStatuses(clientId: number) {
    return this.statusModel.findAll({
      where: { clientId },
      order: [['order', 'ASC']],
    });
  }

  async getPriorities(clientId: number) {
    return this.priorityModel.findAll({
      where: { clientId },
      order: [['order', 'ASC']],
    } as any);
  }

  async create(clientId: number, userId: number, dto: CreateTaskDto) {
    const transaction = await this.sequelize.transaction();
    try {
      // 1. Generate Task Code safely
      let taskCode: string;
      if (dto.parentTaskId) {
        // Find the parent task to get its taskCode
        const parentTask = await this.taskModel.findOne({
          where: { id: dto.parentTaskId, clientId },
          transaction,
        });
        if (!parentTask) {
          throw new NotFoundException('Parent task not found');
        }

        // Count existing subtasks under this parent task (including soft-deleted ones)
        const subtaskCount = await this.taskModel.count({
          where: { parentTaskId: dto.parentTaskId, clientId },
          paranoid: false,
          transaction,
        });

        // Convert the count to a letter suffix (0 -> A, 1 -> B, etc.)
        const getLetterSuffix = (num: number): string => {
          let temp = num;
          let suffix = '';
          while (temp >= 0) {
            suffix = String.fromCharCode((temp % 26) + 65) + suffix;
            temp = Math.floor(temp / 26) - 1;
          }
          return suffix;
        };

        const suffix = getLetterSuffix(subtaskCount);
        const parentCode = parentTask.taskCode || `TASK-${parentTask.id}`;
        taskCode = `${parentCode}-${suffix}`;
      } else {
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
        taskCode = `TASK-${newSeq}`;
      }

      // 2. Validate tenant relationships (Status, Priority, Assignees)
      let resolvedStatusId = dto.statusId;
      if (dto.statusName) {
        let status = await this.statusModel.findOne({
          where: { name: dto.statusName, clientId },
          transaction,
        });
        if (!status)
          status = await this.statusModel.create(
            { clientId, name: dto.statusName, order: 0, isCompleted: false },
            { transaction },
          );
        resolvedStatusId = status.id;
      } else if (dto.statusId) {
        const status = await this.statusModel.findOne({
          where: { id: dto.statusId, clientId },
        });
        if (!status)
          throw new NotFoundException(
            'Status not found or does not belong to tenant',
          );
      }

      let resolvedPriorityId = dto.priorityId;
      if (dto.priorityName) {
        let priority: any = await this.priorityModel.findOne({
          where: { name: dto.priorityName, clientId },
          transaction,
        } as any);
        if (!priority)
          priority = await this.priorityModel.create(
            {
              clientId,
              name: dto.priorityName,
              order: 0,
              color: '#333',
            },
            { transaction } as any,
          );
        resolvedPriorityId = priority.id;
      } else if (dto.priorityId) {
        const priority = await this.priorityModel.findOne({
          where: { id: dto.priorityId, [Op.or]: [{ clientId }, { clientId: null }] },
        });
        if (!priority)
          throw new NotFoundException(
            'Priority not found or does not belong to tenant',
          );
      }
      if (dto.ownerId) {
        const ownerUser = await this.userModel.findOne({
          where: { 
            id: dto.ownerId,
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
          transaction,
        });
        if (!ownerUser) throw new NotFoundException('Owner not found or invalid');
      }

      if (dto.assigneeIds?.length) {
        const count = await this.userModel.count({
          where: { 
            id: { [Op.in]: dto.assigneeIds }, 
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
        });
        if (count !== dto.assigneeIds.length)
          throw new NotFoundException('One or more assignees invalid');
      }

      // 3. Create Task
      const taskPayload: any = {
        ...dto,
        statusId: resolvedStatusId,
        priorityId: resolvedPriorityId,
        taskCode,
        clientId,
        createdById: userId,
        completionPercentage: 0,
      };
      if (dto.startDate) taskPayload.startDate = new Date(dto.startDate);
      if (dto.dueDate) taskPayload.dueDate = new Date(dto.dueDate);

      const task = await this.taskRepo.create(taskPayload, transaction);

      // 4. Set relations
      if (dto.assigneeIds?.length)
        await this.taskRepo.setAssignees(
          task.id,
          clientId,
          dto.assigneeIds,
          userId,
          transaction,
        );

      if (dto.labelIds?.length)
        await this.taskRepo.setLabels(
          task.id,
          clientId,
          dto.labelIds,
          transaction,
        );

      // 5. Activity Log (userId is null for super admins who are not in employees table)
      await this.activityService.logEvent(
        task.id,
        clientId,
        null,
        'created',
        transaction,
      );

      await transaction.commit();

      this.eventEmitter.emit('task.created', {
        taskId: task.id,
        clientId,
        userId,
      });
      return task;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async update(
    id: number,
    clientId: number,
    userId: number,
    dto: UpdateTaskDto,
  ) {
    const transaction = await this.sequelize.transaction();
    try {
      const oldTask = await this.taskRepo.findByIdAndClient(
        id,
        clientId,
        transaction,
      );
      if (!oldTask) throw new NotFoundException('Task not found');

      if (dto.priorityId && dto.priorityId !== oldTask.priorityId) {
        const priority = await this.priorityModel.findOne({
          where: { 
            id: dto.priorityId, 
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
        });
        if (!priority) throw new NotFoundException('Priority not found');
      }

      // Optimistic Locking Check
      if (oldTask.version !== dto.version) {
        throw new ConflictException(
          'Task was modified by another user. Please refresh and try again.',
        );
      }

      // Validate status/priority if provided
      if (dto.statusId && dto.statusId !== oldTask.statusId) {
        const status = await this.statusModel.findOne({
          where: { 
            id: dto.statusId, 
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
        });
        if (!status) throw new NotFoundException('Status not found');
      }

      if (dto.ownerId && dto.ownerId !== oldTask.ownerId) {
        const ownerUser = await this.userModel.findOne({
          where: { 
            id: dto.ownerId, 
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
          transaction,
        });
        if (!ownerUser) throw new NotFoundException('Owner not found or invalid');
      }

      if (dto.assigneeIds?.length) {
        const count = await this.userModel.count({
          where: { 
            id: { [Op.in]: dto.assigneeIds }, 
            [Op.or]: [{ clientId }, { clientId: null }] 
          },
        });
        if (count !== dto.assigneeIds.length)
          throw new NotFoundException('One or more assignees invalid');
      }

      const updatePayload: any = { ...dto };
      if (dto.startDate !== undefined) updatePayload.startDate = dto.startDate ? new Date(dto.startDate) : null;
      if (dto.dueDate !== undefined) updatePayload.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

      // 1. Calculate diffs and log
      await this.activityService.generateUpdateLogs(
        oldTask,
        updatePayload,
        clientId,
        userId,
        transaction,
      );

      // 2. Perform Update
      const [affectedCount, [updatedTask]] = await this.taskRepo.update(
        id,
        clientId,
        updatePayload,
        transaction,
      );

      // 3. Update assignees (Associated Team) if provided
      if (dto.assigneeIds !== undefined) {
        await this.taskRepo.setAssignees(
          id,
          clientId,
          dto.assigneeIds,
          userId,
          transaction,
        );
      }

      await transaction.commit();

      // ── CASCADE: If parent task is now completed, cascade to all subtasks ──
      // Only run if this is a parent task (parentTaskId IS NULL) and status changed
      if (dto.statusId) {
        const updatedStatus = await this.statusModel.findOne({
          where: { id: dto.statusId, clientId },
        });
        const isParentTask = !oldTask.parentTaskId; // Only cascade from true parent tasks
        if (updatedStatus?.isCompleted && isParentTask) {
          await this.subtaskService.cascadeStatusToSubtasks(id, clientId, dto.statusId);
        }
      }

      this.eventEmitter.emit('task.updated', {
        taskId: id,
        clientId,
        userId,
        diffs: dto,
      });
      return updatedTask;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async archive(
    id: number,
    clientId: number,
    userId: number,
    dto: ArchiveTaskDto,
  ) {
    const transaction = await this.sequelize.transaction();
    try {
      const task = await this.taskRepo.findByIdAndClient(id, clientId, transaction);
      if (!task) throw new NotFoundException('Task not found');

      const isArchived = dto.isArchived ?? true;
      await this.taskRepo.update(
        id,
        clientId,
        {
          isArchived,
          archivedAt: isArchived ? new Date() : null,
          archivedById: isArchived ? userId : null,
        },
        transaction,
      );

      await this.activityService.logEvent(
        id,
        clientId,
        userId,
        isArchived ? 'archived' : 'unarchived',
        transaction,
      );

      await transaction.commit();

      // ── CASCADE: Mirror archive state to all subtasks ─────────────────────
      if (!task.parentTaskId) {
        await this.subtaskService.cascadeArchiveToSubtasks(id, clientId, isArchived, userId);
      }

      this.eventEmitter.emit(isArchived ? 'task.archived' : 'task.unarchived', {
        taskId: id,
        clientId,
        userId,
      });

      return { success: true };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async delete(id: number, clientId: number, userId: number) {
    const transaction = await this.sequelize.transaction();
    try {
      const task = await this.taskRepo.findByIdAndClient(
        id,
        clientId,
        transaction,
      );
      if (!task) throw new NotFoundException('Task not found');

      await this.taskRepo.softDelete(id, clientId, transaction);
      await this.activityService.logEvent(
        id,
        clientId,
        userId,
        'deleted',
        transaction,
      );

      await transaction.commit();

      // ── CASCADE: Soft-delete all subtasks when parent is deleted ──────────
      if (!task.parentTaskId) {
        await this.subtaskService.cascadeDeleteToSubtasks(id, clientId, userId);
      }

      this.eventEmitter.emit('task.deleted', { taskId: id, clientId, userId });
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async restore(id: number, clientId: number, userId: number) {
    const transaction = await this.sequelize.transaction();
    try {
      const task = await this.taskModel.findOne({
        where: { id, clientId },
        paranoid: false,
        transaction,
      });

      if (!task || !task.deletedAt)
        throw new NotFoundException('Deleted task not found');

      await task.restore({ transaction });
      await this.activityService.logEvent(
        id,
        clientId,
        userId,
        'restored',
        transaction,
      );

      await transaction.commit();

      this.eventEmitter.emit('task.restored', { taskId: id, clientId, userId });
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
