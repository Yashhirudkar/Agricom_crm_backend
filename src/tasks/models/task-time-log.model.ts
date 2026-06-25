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
  Default,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { Task } from './task.model';

@Table({
  tableName: 'task_time_logs',
  timestamps: true,
})
export class TaskTimeLog extends Model<TaskTimeLog> {
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
  @Index('task_time_logs_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @ForeignKey(() => User)
  @Index('task_time_logs_user_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare startedAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare pausedAt: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare endedAt: Date | null;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare durationMinutes: number;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isManual: boolean;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare notes: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
