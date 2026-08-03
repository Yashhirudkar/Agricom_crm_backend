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

@Table({
  tableName: 'conversation_settings',
  timestamps: true,
})
export class ConversationSetting extends Model<ConversationSetting> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @Index
  @ForeignKey(() => Conversation)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare conversationId: number;

  @BelongsTo(() => Conversation, { onDelete: 'CASCADE' })
  declare conversation: Conversation;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowVoice: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowVideo: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowGif: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowForward: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowReply: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowEdit: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowDelete: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowReaction: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowPoll: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowMention: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare allowExport: boolean;

  @AllowNull(false)
  @Default(10485760) // 10MB default
  @Column({ type: DataType.BIGINT })
  declare maxUploadSize: number;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare retentionDays: number | null;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare allowedMimeTypes: string[] | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
