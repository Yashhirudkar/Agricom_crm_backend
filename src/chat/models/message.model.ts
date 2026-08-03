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
  DeletedAt,
  ForeignKey,
  BelongsTo,
  Index,
  HasMany,
  HasOne,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { User } from '../../users/models/user.model';
import { MessageType } from '../constants/chat.constants';
import { MessageReaction } from './message-reaction.model';
import { MessageAttachment } from './message-attachment.model';
import { MessageMention } from './message-mention.model';
import { MessageReadState } from './message-read-state.model';
import { MessageVersion } from './message-version.model';
import { MessagePin } from './message-pin.model';
import { MessagePoll } from './message-poll.model';

@Table({
  tableName: 'messages',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      fields: ['conversationId', 'createdAt'],
    },
    {
      fields: ['senderId'],
    },
  ],
})
export class Message extends Model<Message> {
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
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare senderId: number | null;

  @BelongsTo(() => User, { foreignKey: 'senderId', onDelete: 'SET NULL' })
  declare sender: User | null;

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
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isEdited: boolean;

  @AllowNull(false)
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare version: number;

  @ForeignKey(() => Message)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare parentId: number | null;

  @BelongsTo(() => Message, { foreignKey: 'parentId', onDelete: 'CASCADE' })
  declare parentMessage: Message | null;

  @HasMany(() => Message, { foreignKey: 'parentId', onDelete: 'CASCADE' })
  declare replies: Message[];

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isDeleted: boolean;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare deletedBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'deletedBy', onDelete: 'SET NULL' })
  declare deleter: User | null;

  @HasMany(() => MessageReaction, { onDelete: 'CASCADE', hooks: true })
  declare reactions: MessageReaction[];

  @HasMany(() => MessageAttachment, { onDelete: 'CASCADE', hooks: true })
  declare attachments: MessageAttachment[];

  @HasMany(() => MessageMention, { onDelete: 'CASCADE', hooks: true })
  declare mentions: MessageMention[];

  @HasMany(() => MessageReadState, { onDelete: 'CASCADE', hooks: true })
  declare readStates: MessageReadState[];

  @HasMany(() => MessageVersion, { foreignKey: 'messageId', as: 'versions', onDelete: 'CASCADE', hooks: true })
  declare versions: MessageVersion[];

  @HasMany(() => MessagePin, { foreignKey: 'messageId', as: 'pins', onDelete: 'CASCADE', hooks: true })
  declare pins: MessagePin[];

  @HasOne(() => MessagePoll, { foreignKey: 'messageId', as: 'poll', onDelete: 'CASCADE', hooks: true })
  declare poll: MessagePoll;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;
}
