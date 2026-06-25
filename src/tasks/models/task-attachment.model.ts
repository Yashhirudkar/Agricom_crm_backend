import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Index,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { Task } from './task.model';

@Table({
  tableName: 'task_attachments',
  timestamps: true,
  updatedAt: false, // Attachments generally don't change, they are deleted or uploaded
})
export class TaskAttachment extends Model<TaskAttachment> {
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
  @Index('task_attachments_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, 'userId')
  declare uploadedBy: User;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare fileName: string;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare fileUrl: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare fileType: string | null; // MIME type or extension

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare fileSize: number | null; // Size in bytes

  @CreatedAt
  declare uploadedAt: Date;
}
