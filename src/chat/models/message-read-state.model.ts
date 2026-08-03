import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Message } from './message.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'message_read_states',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'messageId'],
    },
    {
      fields: ['messageId'],
    },
  ],
})
export class MessageReadState extends Model<MessageReadState> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare userId: number;

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @ForeignKey(() => Message)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare messageId: number;

  @BelongsTo(() => Message, { onDelete: 'CASCADE' })
  declare message: Message;

  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isRead: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare readAt: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare deletedAt: Date | null;

  @AllowNull(false)
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isStarred: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
