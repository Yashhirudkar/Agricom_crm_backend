import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  Default,
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { TaskStatus } from './task-status.model';
import { TaskPriority } from './task-priority.model';
import { TaskAssignee } from './task-assignee.model';

import { TaskComment } from './task-comment.model';
import { TaskAttachment } from './task-attachment.model';
import { TaskLabelMap } from './task-label-map.model';
import { HasMany } from 'sequelize-typescript';

@Table({
  tableName: 'tasks',
  timestamps: true,
  paranoid: true, // Soft delete (isArchived/deletedAt)
  version: true, // Optimistic locking (adds `version` column automatically)
  indexes: [
    { fields: ['clientId', 'isArchived'], name: 'tasks_client_archived' },
    { fields: ['clientId', 'deletedAt'], name: 'tasks_client_deleted' },
    { fields: ['clientId', 'createdById'], name: 'tasks_client_created_by' },
    { fields: ['clientId', 'priorityId'], name: 'tasks_client_priority' },
    { fields: ['clientId', 'updatedAt'], name: 'tasks_client_updated' },
  ],
})
export class Task extends Model<Task> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare clientId: number;

  @BelongsTo(() => Client)
  declare client: Client;

  // ── Basic Info ─────────────────────────────────────────────────────────────

  @Index('tasks_client_task_code')
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare taskCode: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare title: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  // ── Status & Priority ──────────────────────────────────────────────────────

  @ForeignKey(() => TaskStatus)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare statusId: number | null;

  @BelongsTo(() => TaskStatus)
  declare status: TaskStatus;

  @ForeignKey(() => TaskPriority)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare priorityId: number | null;

  @BelongsTo(() => TaskPriority)
  declare priority: TaskPriority;

  // ── Hierarchy ──────────────────────────────────────────────────────────────

  @ForeignKey(() => Task)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare parentTaskId: number | null;

  @BelongsTo(() => Task)
  declare parentTask: Task;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare displayOrder: number;

  // ── Polymorphic Linking ────────────────────────────────────────────────────

  @Index('tasks_polymorphic_link')
  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare entityModule: string | null;

  @Index('tasks_polymorphic_link')
  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare entityTable: string | null;

  @Index('tasks_polymorphic_link')
  @AllowNull(true)
  @Column({ type: DataType.STRING(255) }) // String compatible for UUIDs or Integers
  declare entityId: string | null;

  // ── Work Tracking ──────────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare estimatedMinutes: number | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare actualMinutes: number | null;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare completionPercentage: number; // 0 to 100

  // ── Dates & Auditing ───────────────────────────────────────────────────────

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare startDate: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare dueDate: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare completedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare createdById: number;

  @BelongsTo(() => User, 'createdById')
  declare createdBy: User;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare ownerId: number | null;

  @BelongsTo(() => User, 'ownerId')
  declare owner: User;

  @HasMany(() => TaskAssignee)
  declare assignees: TaskAssignee[];

  @HasMany(() => TaskComment)
  declare comments: TaskComment[];

  @HasMany(() => TaskAttachment)
  declare attachments: TaskAttachment[];

  @HasMany(() => TaskLabelMap)
  declare labels: TaskLabelMap[];

  // ── Archive Support ────────────────────────────────────────────────────────

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isArchived: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare archivedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare archivedById: number | null;

  @BelongsTo(() => User, 'archivedById')
  declare archivedBy: User;

  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isDeleted: boolean;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare deletedBy: number | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date;
}
