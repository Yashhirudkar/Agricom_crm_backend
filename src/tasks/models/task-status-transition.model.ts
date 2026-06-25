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
import { TaskStatus } from './task-status.model';

@Table({
  tableName: 'task_status_transitions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_task_status_transitions_unique',
      unique: true,
      fields: ['clientId', 'fromStatusId', 'toStatusId'],
    },
  ],
})
export class TaskStatusTransition extends Model<TaskStatusTransition> {
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

  @ForeignKey(() => TaskStatus)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare fromStatusId: number;

  @BelongsTo(() => TaskStatus, 'fromStatusId')
  declare fromStatus: TaskStatus;

  @ForeignKey(() => TaskStatus)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare toStatusId: number;

  @BelongsTo(() => TaskStatus, 'toStatusId')
  declare toStatus: TaskStatus;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
