import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '08';
export const name = 'Tasks Engine & Performance Optimization Architecture';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── 1. task_statuses ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_statuses',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      color: { type: DataTypes.STRING(50), allowNull: true },
      order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isCompleted' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 2. task_priorities ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_priorities',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      color: { type: DataTypes.STRING(50), allowNull: true },
      order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 3. task_labels ──────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_labels',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      color: { type: DataTypes.STRING(50), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 4. tasks ────────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'tasks',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      taskCode: { type: DataTypes.STRING(100), allowNull: false, field: 'taskCode' },
      title: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      statusId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'statusId',
        references: { model: 'task_statuses', key: 'id' },
        onDelete: 'CASCADE',
      },
      priorityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'priorityId',
        references: { model: 'task_priorities', key: 'id' },
        onDelete: 'CASCADE',
      },
      parentTaskId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'parentTaskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'displayOrder' },
      entityModule: { type: DataTypes.STRING(100), allowNull: true, field: 'entityModule' },
      entityTable: { type: DataTypes.STRING(100), allowNull: true, field: 'entityTable' },
      entityId: { type: DataTypes.STRING(255), allowNull: true, field: 'entityId' },
      estimatedMinutes: { type: DataTypes.INTEGER, allowNull: true, field: 'estimatedMinutes' },
      actualMinutes: { type: DataTypes.INTEGER, allowNull: true, field: 'actualMinutes' },
      completionPercentage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'completionPercentage' },
      startDate: { type: DataTypes.DATE, allowNull: true, field: 'startDate' },
      dueDate: { type: DataTypes.DATE, allowNull: true, field: 'dueDate' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completedAt' },
      createdById: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'createdById',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'ownerId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isArchived' },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archivedAt' },
      archivedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'archivedById',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isDeleted' },
      deletedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'deletedBy' },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deletedAt' },
    },
    { ifNotExists: true } as any,
  );

  await queryInterface.addIndex('tasks', ['clientId', 'isArchived'], { name: 'tasks_client_archived' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'deletedAt'], { name: 'tasks_client_deleted' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'createdById'], { name: 'tasks_client_created_by' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'priorityId'], { name: 'tasks_client_priority' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['entityModule', 'entityTable', 'entityId'], { name: 'tasks_polymorphic_link' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['taskCode'], { name: 'tasks_client_task_code' }).catch(() => { });

  // Performance Indexes
  await queryInterface.addIndex('tasks', ['clientId', 'createdAt', 'id'], { name: 'tasks_client_created_at_composite' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'statusId', 'createdAt'], { name: 'tasks_client_status_created_at' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'ownerId'], { name: 'tasks_client_owner' }).catch(() => { });
  await queryInterface.addIndex('tasks', ['clientId', 'dueDate'], { name: 'tasks_client_due_date' }).catch(() => { });

  // ─── 5. task_assignees ───────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_assignees',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      assignedAt: { type: DataTypes.DATE, allowNull: true, field: 'assignedAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 6. task_comments ────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_comments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      content: { type: DataTypes.TEXT, allowNull: false },
      isEdited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isEdited' },
      parentCommentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'parentCommentId',
        references: { model: 'task_comments', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 7. task_comment_histories ───────────────────────────────────────────────
  await queryInterface.createTable(
    'task_comment_histories',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      commentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'commentId',
        references: { model: 'task_comments', key: 'id' },
        onDelete: 'CASCADE',
      },
      previousContent: { type: DataTypes.TEXT, allowNull: false, field: 'previousContent' },
      editedAt: { type: DataTypes.DATE, allowNull: false, field: 'editedAt' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 8. task_comment_mentions ────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_comment_mentions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      commentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'commentId',
        references: { model: 'task_comments', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 9. task_checklists ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_checklists',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      isCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isCompleted' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completedAt' },
      completedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'completedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 10. task_attachments ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_attachments',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'uploadedBy',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      fileName: { type: DataTypes.STRING(255), allowNull: false, field: 'fileName' },
      filePath: { type: DataTypes.STRING(1000), allowNull: false, field: 'filePath' },
      mimeType: { type: DataTypes.STRING(100), allowNull: true, field: 'mimeType' },
      fileSize: { type: DataTypes.INTEGER, allowNull: true, field: 'fileSize' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 11. task_label_maps ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_label_maps',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      labelId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'labelId',
        references: { model: 'task_labels', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 12. task_time_logs ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_time_logs',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      startTime: { type: DataTypes.DATE, allowNull: false, field: 'startTime' },
      endTime: { type: DataTypes.DATE, allowNull: true, field: 'endTime' },
      durationMinutes: { type: DataTypes.INTEGER, allowNull: true, field: 'durationMinutes' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 13. task_dependencies ───────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_dependencies',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      dependsOnTaskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'dependsOnTaskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      dependencyType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'FINISH_TO_START', field: 'dependencyType' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 14. task_custom_fields ──────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_custom_fields',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      fieldType: { type: DataTypes.STRING(50), allowNull: false, field: 'fieldType' },
      fieldOptions: { type: DataTypes.JSON, allowNull: true, field: 'fieldOptions' },
      isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'isRequired' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 15. task_custom_field_values ────────────────────────────────────────────
  await queryInterface.createTable(
    'task_custom_field_values',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      fieldId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'fieldId',
        references: { model: 'task_custom_fields', key: 'id' },
        onDelete: 'CASCADE',
      },
      value: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 16. task_sequences ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_sequences',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      prefix: { type: DataTypes.STRING(20), allowNull: false },
      lastNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'lastNumber' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 17. task_sla_rules ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_sla_rules',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      priorityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'priorityId',
        references: { model: 'task_priorities', key: 'id' },
        onDelete: 'SET NULL',
      },
      responseTimeHours: { type: DataTypes.INTEGER, allowNull: true, field: 'responseTimeHours' },
      resolutionTimeHours: { type: DataTypes.INTEGER, allowNull: true, field: 'resolutionTimeHours' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 18. task_status_transitions ─────────────────────────────────────────────
  await queryInterface.createTable(
    'task_status_transitions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      fromStatusId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'fromStatusId',
        references: { model: 'task_statuses', key: 'id' },
        onDelete: 'CASCADE',
      },
      toStatusId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'toStatusId',
        references: { model: 'task_statuses', key: 'id' },
        onDelete: 'CASCADE',
      },
      isAllowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isAllowed' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 19. task_recurrences ────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_recurrences',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      frequency: { type: DataTypes.STRING(50), allowNull: false },
      interval: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      daysOfWeek: { type: DataTypes.JSON, allowNull: true, field: 'daysOfWeek' },
      dayOfMonth: { type: DataTypes.INTEGER, allowNull: true, field: 'dayOfMonth' },
      monthOfYear: { type: DataTypes.INTEGER, allowNull: true, field: 'monthOfYear' },
      startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'startDate' },
      endDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'endDate' },
      maxOccurrences: { type: DataTypes.INTEGER, allowNull: true, field: 'maxOccurrences' },
      nextRunDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'nextRunDate' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 20. task_recurrence_exceptions ──────────────────────────────────────────
  await queryInterface.createTable(
    'task_recurrence_exceptions',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      recurrenceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'recurrenceId',
        references: { model: 'task_recurrences', key: 'id' },
        onDelete: 'CASCADE',
      },
      exceptionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'exceptionDate' },
      reason: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 21. task_templates ──────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_templates',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'clientId',
        references: { model: 'clients', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      defaultPriorityId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'defaultPriorityId',
        references: { model: 'task_priorities', key: 'id' },
        onDelete: 'SET NULL',
      },
      estimatedMinutes: { type: DataTypes.INTEGER, allowNull: true, field: 'estimatedMinutes' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'isActive' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 22. task_template_items ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_template_items',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      templateId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'templateId',
        references: { model: 'task_templates', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  // ─── 23. task_activities ─────────────────────────────────────────────────────
  await queryInterface.createTable(
    'task_activities',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      taskId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'taskId',
        references: { model: 'tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'userId',
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      activityType: { type: DataTypes.STRING(100), allowNull: false, field: 'activityType' },
      oldValue: { type: DataTypes.TEXT, allowNull: true, field: 'oldValue' },
      newValue: { type: DataTypes.TEXT, allowNull: true, field: 'newValue' },
      metadata: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'createdAt' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updatedAt' },
    },
    { ifNotExists: true } as any,
  );

  console.log('✅ Phase 08 - Tasks Engine & Performance Indexes created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('tasks', 'tasks_client_due_date').catch(() => { });
  await queryInterface.removeIndex('tasks', 'tasks_client_owner').catch(() => { });
  await queryInterface.removeIndex('tasks', 'tasks_client_status_created_at').catch(() => { });
  await queryInterface.removeIndex('tasks', 'tasks_client_created_at_composite').catch(() => { });

  await queryInterface.dropTable('task_activities').catch(() => { });
  await queryInterface.dropTable('task_template_items').catch(() => { });
  await queryInterface.dropTable('task_templates').catch(() => { });
  await queryInterface.dropTable('task_recurrence_exceptions').catch(() => { });
  await queryInterface.dropTable('task_recurrences').catch(() => { });
  await queryInterface.dropTable('task_status_transitions').catch(() => { });
  await queryInterface.dropTable('task_sla_rules').catch(() => { });
  await queryInterface.dropTable('task_sequences').catch(() => { });
  await queryInterface.dropTable('task_custom_field_values').catch(() => { });
  await queryInterface.dropTable('task_custom_fields').catch(() => { });
  await queryInterface.dropTable('task_dependencies').catch(() => { });
  await queryInterface.dropTable('task_time_logs').catch(() => { });
  await queryInterface.dropTable('task_label_maps').catch(() => { });
  await queryInterface.dropTable('task_attachments').catch(() => { });
  await queryInterface.dropTable('task_checklists').catch(() => { });
  await queryInterface.dropTable('task_comment_mentions').catch(() => { });
  await queryInterface.dropTable('task_comment_histories').catch(() => { });
  await queryInterface.dropTable('task_comments').catch(() => { });
  await queryInterface.dropTable('task_assignees').catch(() => { });
  await queryInterface.dropTable('tasks').catch(() => { });
  await queryInterface.dropTable('task_labels').catch(() => { });
  await queryInterface.dropTable('task_priorities').catch(() => { });
  await queryInterface.dropTable('task_statuses').catch(() => { });
  console.log('✅ Phase 08 - Tasks Engine & Performance Indexes dropped');
}
