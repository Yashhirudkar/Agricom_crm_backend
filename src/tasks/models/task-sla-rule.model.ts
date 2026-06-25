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
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { TaskPriority } from './task-priority.model';

@Table({
  tableName: 'task_sla_rules',
  timestamps: true,
})
export class TaskSlaRule extends Model<TaskSlaRule> {
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

  @ForeignKey(() => TaskPriority)
  @Index('task_sla_rules_priority_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare priorityId: number;

  @BelongsTo(() => TaskPriority)
  declare priority: TaskPriority;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare targetCompletionMinutes: number;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare escalationPolicyId: number | null; // Future feature link

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
