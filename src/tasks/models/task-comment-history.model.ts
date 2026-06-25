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
import { TaskComment } from './task-comment.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'task_comment_histories',
  timestamps: true,
  updatedAt: false,
})
export class TaskCommentHistory extends Model<TaskCommentHistory> {
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

  @ForeignKey(() => TaskComment)
  @Index('task_comment_history_comment_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare commentId: number;

  @BelongsTo(() => TaskComment)
  declare comment: TaskComment;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare previousContent: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare editedByUserId: number | null;

  @BelongsTo(() => User, 'editedByUserId')
  declare editedBy: User;

  @CreatedAt
  declare createdAt: Date;
}
