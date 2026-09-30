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
import { Company } from '../../companies/models/company.model';


@Table({
  tableName: 'task_comment_histories',
  timestamps: true,
  updatedAt: false,
})
export class TaskCommentHistory extends Model<TaskCommentHistory> {

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ field: 'company_id', type: DataType.INTEGER })
  declare companyId: number;

  @BelongsTo(() => Company)
  declare company: Company;

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
  @Index('task_comment_history_comment_id')
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare commentId: number;

  @BelongsTo(() => TaskComment, { onDelete: 'CASCADE' })
  declare comment: TaskComment;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare previousContent: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare editedByUserId: number | null;

  @BelongsTo(() => User, { foreignKey: 'editedByUserId', onDelete: 'CASCADE' })
  declare editedBy: User;

  @CreatedAt
  declare createdAt: Date;
}
