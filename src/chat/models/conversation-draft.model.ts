import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  UpdatedAt,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'conversation_drafts',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'userId'],
    },
  ],
})
export class ConversationDraft extends Model<ConversationDraft> {
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

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  declare user: User;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare content: string | null;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare payload: any;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
