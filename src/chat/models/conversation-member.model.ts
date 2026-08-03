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
import { MemberRole } from '../constants/chat.constants';

@Table({
  tableName: 'conversation_members',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'userId'],
    },
    {
      fields: ['userId'],
    },
  ],
})
export class ConversationMember extends Model<ConversationMember> {
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
  declare userId: number;

  @BelongsTo(() => User, { onDelete: 'CASCADE' })
  declare user: User;

  @AllowNull(false)
  @Default(MemberRole.MEMBER)
  @Column({
    type: DataType.ENUM(
      MemberRole.OWNER,
      MemberRole.ADMIN,
      MemberRole.MODERATOR,
      MemberRole.MEMBER,
      MemberRole.VIEWER,
      MemberRole.GUEST,
    ),
  })
  declare role: MemberRole;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isMuted: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare mutedUntil: Date | null;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isPinned: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isFavorite: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isHidden: boolean;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare unreadMessagesCount: number;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare unreadMentionsCount: number;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare unreadThreadsCount: number;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare lastReadMessageId: number | null;

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column({ type: DataType.DATE })
  declare joinedAt: Date;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
