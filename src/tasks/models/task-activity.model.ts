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
import { User } from '../../users/models/user.model';
import { Task } from './task.model';

@Table({
  tableName: 'task_activities',
  timestamps: true,
  updatedAt: false, // Audit log is immutable, no updatedAt needed
})
export class TaskActivity extends Model<TaskActivity> {
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
  @Index('task_activities_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @ForeignKey(() => User)
  @AllowNull(true) // System actions might not have an actor
  @Column({ type: DataType.INTEGER })
  declare userId: number | null;

  @BelongsTo(() => User)
  declare user: User;

  // Uses VARCHAR instead of ENUM for extensibility (e.g., 'created', 'status_changed')
  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare actionType: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare fieldName: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare oldValue: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare newValue: string | null;

  @Index('task_activities_created_at')
  @CreatedAt
  declare createdAt: Date;
}
