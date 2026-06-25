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
  tableName: 'task_comments',
  timestamps: true,
})
export class TaskComment extends Model<TaskComment> {
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
  @Index('task_comments_task_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare taskId: number;

  @BelongsTo(() => Task)
  declare task: Task;

  // Support for nested replies/threaded discussions
  @ForeignKey(() => TaskComment)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare parentCommentId: number | null;

  @BelongsTo(() => TaskComment)
  declare parentComment: TaskComment;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, 'userId')
  declare user: User;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare content: string;

  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isEdited: boolean;

  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isDeleted: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare deletedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare deletedByUserId: number | null;

  @BelongsTo(() => User, 'deletedByUserId')
  declare deletedBy: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
