import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
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
  BulkArchiveDto,
  BulkStatusDto,
  BulkActionDto,
} from '../dto';
import { TaskSequence, TaskStatus, TaskPriority, Task, TaskAssignee } from '../models';
import { User } from '../../users/models/user.model';
import { Op } from 'sequelize';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';

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
    @InjectModel(TaskAssignee)
    private readonly taskAssigneeModel: typeof TaskAssignee,
    private readonly notificationsService: NotificationsService,
  ) { }

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

    return {
      items: enrichedData,
      data: enrichedData,
      nextCursor: (result as any).nextCursor,
      hasMore: (result as any).hasMore,
      meta: result.meta,
    };
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
    let statuses = await this.statusModel.findAll({
      where: { clientId },
      order: [['order', 'ASC']],
    });

    const defaultStatuses = [
      { name: 'Open', order: 0, isCompleted: false, color: '#3b82f6' },
      { name: 'In Progress', order: 1, isCompleted: false, color: '#eab308' },
      { name: 'On Hold', order: 2, isCompleted: false, color: '#6b7280' },
      { name: 'Completed', order: 3, isCompleted: true, color: '#22c55e' },
    ];

    if (statuses.length < defaultStatuses.length) {
      const existingNames = statuses.map((s) => s.name);
      const missingStatuses = defaultStatuses
        .filter((s) => !existingNames.includes(s.name))
        .map((s) => ({ ...s, clientId }));

      if (missingStatuses.length > 0) {
        await this.statusModel.bulkCreate(missingStatuses);
        statuses = await this.statusModel.findAll({
          where: { clientId },
          order: [['order', 'ASC']],
        });
      }
    }

    return statuses;
  }

  async getPriorities(clientId: number) {
    let priorities = await this.priorityModel.findAll({
      where: { clientId },
      order: [['order', 'ASC']],
    } as any);

    const defaultPriorities = [
      { name: 'Low', order: 0, color: '#22c55e' },
      { name: 'Medium', order: 1, color: '#eab308' },
      { name: 'High', order: 2, color: '#ef4444' },
    ];

    if (priorities.length < defaultPriorities.length) {
      const existingNames = priorities.map((p) => p.name);
      const missingPriorities = defaultPriorities
        .filter((p) => !existingNames.includes(p.name))
        .map((p) => ({ ...p, clientId }));

      if (missingPriorities.length > 0) {
        await this.priorityModel.bulkCreate(missingPriorities);
        priorities = await this.priorityModel.findAll({
          where: { clientId },
          order: [['order', 'ASC']],
        } as any);
      }
    }

    return priorities;
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
          where: { id: dto.ownerId },
          transaction,
        });
        if (!ownerUser) throw new NotFoundException('Owner not found or invalid');
      }

      if (dto.assigneeIds?.length) {
        const count = await this.userModel.count({
          where: { id: { [Op.in]: dto.assigneeIds } },
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
        // Auto-assign current user as owner if not explicitly provided
        ownerId: dto.ownerId || userId,
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

      this.triggerTaskNotification(task.id, clientId, 'Task Assigned', userId).catch((err) => {
        console.error(`Failed to trigger task created notification: ${err.message}`);
      });

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

      // Status Restriction Check: If the task has assignees and the current user is the owner, they cannot change the status.
      if (dto.statusId !== undefined && dto.statusId !== oldTask.statusId) {
        if (oldTask.ownerId === userId) {
          const assigneeCount = await this.taskAssigneeModel.count({
            where: { taskId: id, clientId },
            transaction,
          });
          if (assigneeCount > 0) {
            throw new ForbiddenException(
              'The task owner is not allowed to change the status of an assigned task.',
            );
          }
        }
      }

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

      const targetStatusId = dto.statusId !== undefined ? dto.statusId : oldTask.statusId;
      if (targetStatusId) {
        this.statusModel.findOne({
          where: { id: targetStatusId, clientId },
        }).then((statusObj) => {
          const isCompleted = statusObj?.isCompleted || false;
          const notificationTitle = isCompleted ? 'Task Completed' : 'Task Updated';
          this.triggerTaskNotification(id, clientId, notificationTitle, userId).catch((err) => {
            console.error(`Failed to trigger task updated notification: ${err.message}`);
          });
        }).catch((err) => {
          console.error(`Failed to query status model for notification: ${err.message}`);
        });
      } else {
        this.triggerTaskNotification(id, clientId, 'Task Updated', userId).catch((err) => {
          console.error(`Failed to trigger task updated notification: ${err.message}`);
        });
      }

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

      // Deletion Restriction Check: Only the task owner (or creator if no owner is assigned) can delete the task.
      const isOwner = task.ownerId ? task.ownerId === userId : task.createdById === userId;
      if (!isOwner) {
        throw new ForbiddenException('Only the task owner is allowed to delete this task.');
      }

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

  private async triggerTaskNotification(
    taskId: number,
    clientId: number,
    title: string,
    actorId: number,
  ) {
    try {
      console.log(`[triggerTaskNotification] Starting trigger for task: ${taskId}, title: ${title}, actorId: ${actorId}`);
      const task = await this.taskModel.findOne({
        where: { id: taskId, clientId },
        include: [
          { model: TaskStatus, as: 'status' },
          { model: TaskAssignee, as: 'assignees' },
        ],
      });

      if (!task) {
        console.warn(`[triggerTaskNotification] Task not found with ID ${taskId} and clientID ${clientId}`);
        return;
      }

      const ownerId = task.ownerId;
      const assigneeIds = task.assignees?.map((a) => a.userId) || [];
      const recipients = [ownerId, ...assigneeIds].filter((id): id is number => !!id);
      
      console.log(`[triggerTaskNotification] Task title: "${task.title}". Owner ID: ${ownerId}. Assignee IDs:`, assigneeIds);
      console.log(`[triggerTaskNotification] Combined recipients list:`, recipients);

      const statusName = task.status?.name || 'Open';

      console.log(`[triggerTaskNotification] Calling notificationsService.createNotification with payload...`);
      await this.notificationsService.createNotification(
        {
          recipients,
          type: NotificationType.TASK,
          referenceType: 'task',
          referenceId: taskId,
          title,
          payload: {
            taskId,
            taskName: task.title,
            status: statusName,
            url: `/tasks/${taskId}`,
            icon: 'task',
          },
        },
        actorId,
      );
      console.log(`[triggerTaskNotification] notificationsService.createNotification call completed successfully.`);
    } catch (err) {
      console.error(`[triggerTaskNotification] Error triggering notification: ${err.message}`, err);
    }
  }

  private buildBulkWhere(clientId: number, dto: any): any {
    if (dto.selectAll) {
      const { where, filterCompleted } = this.taskQueryRepo.buildWhereClause(clientId, dto.filters);
      
      if (dto.excludedIds && dto.excludedIds.length > 0) {
        where.id = { [Op.notIn]: dto.excludedIds };
      }

      if (filterCompleted !== undefined) {
        where[Op.and] = where[Op.and] || [];
        if (filterCompleted === false) {
          where[Op.and].push(
            this.sequelize.literal(`("Task"."statusId" IS NULL OR EXISTS (
              SELECT 1 FROM "task_statuses" AS "status"
              WHERE "status"."id" = "Task"."statusId" AND "status"."isCompleted" = false
            ))`)
          );
        } else {
          where[Op.and].push(
            this.sequelize.literal(`EXISTS (
              SELECT 1 FROM "task_statuses" AS "status"
              WHERE "status"."id" = "Task"."statusId" AND "status"."isCompleted" = true
            )`)
          );
        }
      }

      if (dto.filters?.assigneeIds && dto.filters.assigneeIds.length > 0) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push(
          this.sequelize.literal(`EXISTS (
            SELECT 1 FROM "task_assignees" AS "assignees"
            WHERE "assignees"."taskId" = "Task"."id" AND "assignees"."userId" IN (${dto.filters.assigneeIds.join(',')})
          )`)
        );
      }
      return where;
    } else {
      return {
        clientId,
        id: { [Op.in]: dto.ids || [] }
      };
    }
  }

  async bulkArchive(clientId: number, userId: number, dto: BulkArchiveDto) {
    const transaction = await this.sequelize.transaction();
    try {
      const where = this.buildBulkWhere(clientId, dto);
      
      const tasks = await this.taskModel.findAll({
        where,
        attributes: ['id', 'isArchived'],
        transaction,
      });

      const matchedIds = tasks.map(t => t.id);
      if (matchedIds.length === 0) {
        await transaction.commit();
        return { success: true, count: 0 };
      }

      const isArchived = dto.isArchived ?? true;
      await this.taskModel.update(
        {
          isArchived,
          archivedAt: isArchived ? new Date() : null,
          archivedById: isArchived ? userId : null,
        },
        {
          where: { id: { [Op.in]: matchedIds }, clientId },
          transaction,
        }
      );

      for (const id of matchedIds) {
        await this.activityService.logEvent(
          id,
          clientId,
          userId,
          isArchived ? 'archived' : 'unarchived',
          transaction,
        );
      }

      await transaction.commit();
      return { success: true, count: matchedIds.length };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async bulkChangeStatus(clientId: number, userId: number, dto: BulkStatusDto) {
    const transaction = await this.sequelize.transaction();
    try {
      const where = this.buildBulkWhere(clientId, dto);
      
      const tasks = await this.taskModel.findAll({
        where,
        attributes: ['id', 'statusId', 'version'],
        transaction,
      });

      const matchedIds = tasks.map(t => t.id);
      if (matchedIds.length === 0) {
        await transaction.commit();
        return { success: true, count: 0 };
      }

      if (dto.version !== undefined) {
        const outOfSync = tasks.some(t => t.version !== dto.version);
        if (outOfSync) {
          throw new ConflictException(
            'Some tasks were modified by another user. Please refresh and try again.',
          );
        }
      }

      const status = await this.statusModel.findOne({
        where: { id: dto.statusId, clientId },
        transaction,
      });
      if (!status) throw new NotFoundException('Status not found');

      await this.taskModel.update(
        {
          statusId: dto.statusId,
          version: Sequelize.literal('"version" + 1'),
        },
        {
          where: { id: { [Op.in]: matchedIds }, clientId },
          transaction,
        }
      );

      for (const id of matchedIds) {
        await this.activityService.logEvent(
          id,
          clientId,
          userId,
          'status_changed',
          transaction,
        );
      }

      await transaction.commit();
      return { success: true, count: matchedIds.length };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async bulkDelete(clientId: number, userId: number, dto: BulkActionDto) {
    const transaction = await this.sequelize.transaction();
    try {
      const where = this.buildBulkWhere(clientId, dto);
      
      const tasks = await this.taskModel.findAll({
        where,
        attributes: ['id', 'ownerId', 'createdById'],
        transaction,
      });

      const matchedIds = tasks.map(t => t.id);
      if (matchedIds.length === 0) {
        await transaction.commit();
        return { success: true, count: 0 };
      }

      await this.taskModel.destroy({
        where: { id: { [Op.in]: matchedIds }, clientId },
        transaction,
      });

      for (const id of matchedIds) {
        await this.activityService.logEvent(
          id,
          clientId,
          userId,
          'deleted',
          transaction,
        );
      }

      await transaction.commit();
      return { success: true, count: matchedIds.length };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
