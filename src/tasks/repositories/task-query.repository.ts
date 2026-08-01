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

  encodeCursor(task: Task, sortBy: string): string {
    const val = task[sortBy];
    const payload = {
      id: task.id,
      val: val instanceof Date ? val.toISOString() : val
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  decodeCursor(cursorStr: string): { id: number; val: any } | null {
    try {
      const json = Buffer.from(cursorStr, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  buildWhereClause(clientId: number, query: TaskQueryDto): { where: any; filterCompleted: boolean | undefined } {
    const {
      search,
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

    const where: any = { clientId };

    // Strict boolean handling
    if (query.preset === 'archived_tasks') {
      where.isArchived = true;
    } else if (isArchived !== undefined) {
      where.isArchived = isArchived;
    } else {
      where.isArchived = false; // Default to non-archived
    }

    const now = new Date();
    // Preset takes priority over query-level isCompleted param
    let filterCompleted: boolean | undefined = isCompleted;

    const hasViewAll = query['hasViewAll'] === true;
    const rawUserId = query['userId'];
    const parsedUserId = Number(rawUserId);
    const userId = (!isNaN(parsedUserId) && rawUserId !== null && rawUserId !== undefined) ? parsedUserId : null;

    // Handle Query Presets
    if (query.preset) {
      switch (query.preset) {
        case 'my_tasks':
          // Show ALL tasks belonging to user (active + completed, non-archived)
          // Preset overrides any isCompleted query param
          filterCompleted = undefined;
          if (userId !== null) {
            where[Op.or] = [
              { ownerId: userId },
              { createdById: userId },
              this.taskModel.sequelize.literal(`EXISTS (
                SELECT 1 FROM "task_assignees" AS "assignees"
                WHERE "assignees"."taskId" = "Task"."id" AND "assignees"."userId" = ${userId}
              )`)
            ];
          }
          break;
        case 'overdue_tasks':
          where.dueDate = { [Op.lt]: now };
          filterCompleted = false; // Overdue = not yet completed
          break;
        case 'completed_tasks':
          filterCompleted = true; // Only completed tasks
          break;
        case 'all_tasks':
          filterCompleted = undefined; // No completion filter
          break;
        case 'archived_tasks':
        default:
          break;
      }
    }

    // If user does NOT have task:view_all permission, scope ALL views to user's own tasks
    if (!hasViewAll && userId !== null) {
      const userCondition = [
        { ownerId: userId },
        { createdById: userId },
        this.taskModel.sequelize.literal(`EXISTS (
          SELECT 1 FROM "task_assignees" AS "assignees"
          WHERE "assignees"."taskId" = "Task"."id" AND "assignees"."userId" = ${userId}
        )`)
      ];

      if (where[Op.or]) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.and]: [
            { [Op.or]: where[Op.or] },
            { [Op.or]: userCondition }
          ]
        });
        delete where[Op.or];
      } else {
        where[Op.or] = userCondition;
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
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.and]: [
            { [Op.or]: where[Op.or] },
            { [Op.or]: searchConditions }
          ]
        });
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

    return { where, filterCompleted };
  }

  async findAndCountAll(clientId: number, query: TaskQueryDto) {
    const {
      limit = 30,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      assigneeIds,
      cursor,
    } = query;

    const { where, filterCompleted } = this.buildWhereClause(clientId, query);

    // Apply cursor condition if provided
    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      if (decoded) {
        const { id, val } = decoded;
        const isDesc = String(sortOrder).toUpperCase() === 'DESC';
        const op = isDesc ? Op.lt : Op.gt;

        where[Op.and] = where[Op.and] || [];
        if (val === null || val === undefined) {
          where[Op.and].push({
            id: { [isDesc ? Op.lt : Op.gt]: id }
          });
        } else {
          const compareVal = sortBy === 'createdAt' || sortBy === 'updatedAt' || sortBy === 'dueDate' ? new Date(val) : val;
          where[Op.and].push({
            [Op.or]: [
              { [sortBy]: { [op]: compareVal } },
              { [sortBy]: compareVal, id: { [isDesc ? Op.lt : Op.gt]: id } }
            ]
          });
        }
      }
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

    // Select only required columns (avoid SELECT * and N+1)
    const rows = await this.taskModel.findAll({
      where,
      attributes: [
        'id',
        'clientId',
        'taskCode',
        'title',
        'description',
        'statusId',
        'priorityId',
        'parentTaskId',
        'displayOrder',
        'entityModule',
        'entityTable',
        'entityId',
        'estimatedMinutes',
        'actualMinutes',
        'completionPercentage',
        'startDate',
        'dueDate',
        'completedAt',
        'createdById',
        'ownerId',
        'isArchived',
        'archivedAt',
        'archivedById',
        'isDeleted',
        'deletedBy',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'version',
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
      include,
      limit: limit + 1, // Fetch limit + 1 to check hasMore without COUNT(*)
      order: [
        [sortBy, sortOrder],
        ['id', sortOrder],
      ],
    });

    const hasMore = rows.length > limit;
    const paginatedRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = paginatedRows.length > 0 ? this.encodeCursor(paginatedRows[paginatedRows.length - 1], sortBy) : null;

    return {
      items: paginatedRows,
      data: paginatedRows,
      nextCursor,
      hasMore,
      meta: {
        nextCursor,
        hasMore,
        limit,
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
