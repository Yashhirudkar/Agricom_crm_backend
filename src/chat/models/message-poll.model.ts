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
  HasMany,
  Index,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { Message } from './message.model';
import { User } from '../../users/models/user.model';
import { MessagePollOption } from './message-poll-option.model';
import { MessagePollVote } from './message-poll-vote.model';

@Table({
  tableName: 'message_polls',
  timestamps: true,
  indexes: [
    {
      fields: ['conversationId'],
    },
    {
      fields: ['messageId'],
    },
  ],
})
export class MessagePoll extends Model<MessagePoll> {
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

  @ForeignKey(() => Message)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare messageId: number | null;

  @BelongsTo(() => Message, { onDelete: 'CASCADE' })
  declare message: Message | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare question: string;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isAnonymous: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare allowMultiple: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isClosed: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare closedAt: Date | null;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare closedBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'closedBy', onDelete: 'SET NULL' })
  declare closer: User | null;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare createdBy: number;

  @BelongsTo(() => User, { foreignKey: 'createdBy', onDelete: 'CASCADE' })
  declare creator: User;

  @HasMany(() => MessagePollOption, { onDelete: 'CASCADE', hooks: true })
  declare options: MessagePollOption[];

  @HasMany(() => MessagePollVote, { onDelete: 'CASCADE', hooks: true })
  declare votes: MessagePollVote[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
