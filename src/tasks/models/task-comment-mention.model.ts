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
import { TaskComment } from './task-comment.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'task_comment_mentions',
  timestamps: true,
})
export class TaskCommentMention extends Model<TaskCommentMention> {
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

  @BelongsTo(() => Client, { onDelete: 'CASCADE' })
  declare client: Client;

  @ForeignKey(() => TaskComment)
  @Index('task_comment_mentions_comment_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare commentId: number;

  @BelongsTo(() => TaskComment, { onDelete: 'CASCADE' })
  declare comment: TaskComment;

  @ForeignKey(() => User)
  @Index('task_comment_mentions_user_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare userId: number;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  declare mentionedUser: User;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
