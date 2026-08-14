import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { User } from '../../users/models/user.model';
import { MessageType } from '../constants/chat.constants';

@Table({
  tableName: 'scheduled_messages',
  timestamps: true,
  indexes: [
    {
      fields: ['scheduledFor', 'isSent'],
    },
    {
      fields: ['conversationId'],
    },
  ],
})
export class ScheduledMessage extends Model<ScheduledMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Conversation)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare conversationId: number;

  @BelongsTo(() => Conversation, { onDelete: 'CASCADE' })
  declare conversation: Conversation;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare senderId: number;

  @BelongsTo(() => User, { foreignKey: 'senderId', onDelete: 'CASCADE' })
  declare sender: User;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare content: string | null;

  @AllowNull(false)
  @Default(MessageType.TEXT)
  @Column({
    type: DataType.ENUM(
      MessageType.TEXT,
      MessageType.FILE,
      MessageType.LOCATION,
      MessageType.POLL,
      MessageType.SYSTEM,
    ),
  })
  declare type: MessageType;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare payload: any;

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare scheduledFor: Date;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isSent: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare sentAt: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
