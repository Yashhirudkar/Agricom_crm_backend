import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { Conversation } from './conversation.model';
import { ConversationLabel } from './conversation-label.model';

@Table({
  tableName: 'conversation_label_maps',
  timestamps: true,
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'labelId'],
    },
  ],
})
export class ConversationLabelMap extends Model<ConversationLabelMap> {
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

  @ForeignKey(() => ConversationLabel)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare labelId: number;

  @BelongsTo(() => ConversationLabel, { onDelete: 'CASCADE' })
  declare label: ConversationLabel;

  @CreatedAt
  declare createdAt: Date;
}
