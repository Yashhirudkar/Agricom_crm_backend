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
  HasMany,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { Task } from './task.model';
import { TaskRecurrenceException } from './task-recurrence-exception.model';

@Table({
  tableName: 'task_recurrences',
  timestamps: true,
})
export class TaskRecurrence extends Model<TaskRecurrence> {
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

  @ForeignKey(() => Task)
  @Index('task_recurrences_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare frequency: string; // e.g., DAILY, WEEKLY, MONTHLY, CUSTOM

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare cronPattern: string | null;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, defaultValue: 1 })
  declare interval: number;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare endDate: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare lastTriggeredAt: Date | null;

  @HasMany(() => TaskRecurrenceException)
  declare exceptions: TaskRecurrenceException[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
