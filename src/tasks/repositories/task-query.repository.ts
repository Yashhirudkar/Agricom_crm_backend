import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskAssignee,
  TaskLabelMap,
  TaskLabel,
  TaskActivity,
  TaskComment,
} from '../models';
import { TaskQueryDto } from '../dto';
import { User } from '../../users/models/user.model';

@Injectable()
export class TaskQueryRepository {
  constructor(
    @InjectModel(Task)
    private readonly taskModel: typeof Task,
  ) { }

  async findAndCountAll(clientId: number, query: TaskQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      statusIds,
      priorityIds,
      assigneeIds,
      createdByIds,
      isArchived,
      isCompleted,
      isOverdue,
      parentTaskId,
      entityModule,
      entityTable,
      entityId,
      dueDateStart,
      dueDateEnd,
      createdAtStart,
      createdAtEnd,
    } = query;

    const offset = (page - 1) * limit;
    const where: any = { clientId };

    // Strict boolean handling
    if (isArchived !== undefined) {
      where.isArchived = isArchived;
    } else if (query.preset === 'archived_tasks') {
      where.isArchived = true;
    } else {
      where.isArchived = false; // Default to non-archived
    }

    const now = new Date();
    let filterCompleted = isCompleted;

    // Handle Query Presets
    if (query.preset) {
      switch (query.preset) {
        case 'my_tasks':
          where[Op.or] = [
            { ownerId: query['userId'] },
            { createdById: query['userId'] },
            this.taskModel.sequelize.literal(`EXISTS (
              SELECT 1 FROM "task_assignees" AS "assignees"
              WHERE "assignees"."taskId" = "Task"."id" AND "assignees"."userId" = ${Number(query['userId'])}
            )`)
          ];
          break;
        case 'overdue_tasks':
          where.dueDate = { [Op.lt]: now };
          filterCompleted = false;
          break;
        case 'completed_tasks':
          filterCompleted = true;
          break;
        case 'all_tasks':
          filterCompleted = undefined;
          break;
        case 'archived_tasks':
        default:
          break;
      }
    }

    if (parentTaskId !== undefined) {
      where.parentTaskId = parentTaskId;
    }

    if (entityModule) where.entityModule = entityModule;
    if (entityTable) where.entityTable = entityTable;
    if (entityId) where.entityId = entityId;

    if (statusIds && statusIds.length > 0)
      where.statusId = { [Op.in]: statusIds };
    if (priorityIds && priorityIds.length > 0)
      where.priorityId = { [Op.in]: priorityIds };
    if (createdByIds && createdByIds.length > 0)
      where.createdById = { [Op.in]: createdByIds };

    // Search (Full-Text friendly setup, fallback to iLike)
    if (search) {
      const searchConditions = [
        { title: { [Op.iLike]: `%${search}%` } },
        { taskCode: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
      if (where[Op.or]) {
        where[Op.and] = [
          { [Op.or]: where[Op.or] },
          { [Op.or]: searchConditions }
        ];
        delete where[Op.or];
      } else {
        where[Op.or] = searchConditions;
      }
    }

    // Date filters
    if (dueDateStart || dueDateEnd) {
      where.dueDate = {};
      if (dueDateStart) where.dueDate[Op.gte] = new Date(dueDateStart);
      if (dueDateEnd) where.dueDate[Op.lte] = new Date(dueDateEnd);
    }

    if (createdAtStart || createdAtEnd) {
      where.createdAt = {};
      if (createdAtStart) where.createdAt[Op.gte] = new Date(createdAtStart);
      if (createdAtEnd) where.createdAt[Op.lte] = new Date(createdAtEnd);
    }

    if (isOverdue) {
      where.dueDate = { [Op.lt]: now };
    }

    // Dynamic Includes
    const include: any[] = [
      { model: TaskPriority, required: false },
      {
        model: User,
        as: 'createdBy',
        attributes: ['id', 'name', 'email', 'avatarUrl'],
        required: false,
      },
      {
        model: User,
        as: 'owner',
        attributes: ['id', 'name', 'email', 'avatarUrl'],
        required: false,
      },
    ];

    if (filterCompleted !== undefined) {
      if (filterCompleted === false) {
        // Include tasks where status is null OR status.isCompleted is false using EXISTS
        include.push({
          model: TaskStatus,
          required: false,
        });
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push(
          this.taskModel.sequelize.literal(`("Task"."statusId" IS NULL OR EXISTS (
            SELECT 1 FROM "task_statuses" AS "status"
            WHERE "status"."id" = "Task"."statusId" AND "status"."isCompleted" = false
          ))`)
        );
      } else {
        include.push({
          model: TaskStatus,
          where: { isCompleted: true },
          required: true,
        });
      }
    } else {
      include.push({ model: TaskStatus, required: false });
    }

    let actualAssigneeIds = assigneeIds;

    if (actualAssigneeIds && actualAssigneeIds.length > 0) {
      // Must have relation if filtered by assignees
      include.push({
        model: TaskAssignee,
        where: { userId: { [Op.in]: actualAssigneeIds } },
        required: true, // Inner join if filtered
        attributes: ['userId'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatarUrl'],
          },
        ],
      });
    } else {
      // Optimize list query: limit returned assignee attributes for scale
      include.push({
        model: TaskAssignee,
        required: false,
        attributes: ['userId'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatarUrl'],
          },
        ],
      });
    }

    const { rows, count } = await this.taskModel.findAndCountAll({
      where,
      attributes: {
        include: [
          [
            this.taskModel.sequelize.literal(`(
              SELECT COALESCE(COUNT(*), 0)
              FROM "task_comments" AS "comments"
              WHERE "comments"."taskId" = "Task"."id" AND "comments"."isDeleted" = false
            )`),
            'commentsCount',
          ],
          [
            this.taskModel.sequelize.literal(`(
              SELECT COALESCE(COUNT(*), 0)
              FROM "task_attachments" AS "attachments"
              WHERE "attachments"."taskId" = "Task"."id"
            )`),
            'attachmentsCount',
          ],
        ],
      },
      include,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      distinct: true, // Essential for count with includes
    });

    return {
      data: rows,
      meta: {
        totalCount: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
        hasNextPage: page * limit < count,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getDetailHydrated(id: number, clientId: number) {
    return this.taskModel.findOne({
      where: { id, clientId },
      include: [
        { model: TaskStatus, required: false },
        { model: TaskPriority, required: false },
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
          required: false,
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
          required: false,
        },
        {
          model: TaskAssignee,
          required: false,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'avatarUrl'],
            },
          ],
        },
      ],
    });
  }
}
