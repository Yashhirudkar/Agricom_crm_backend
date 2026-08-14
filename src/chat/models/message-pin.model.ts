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
import { Message } from './message.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'message_pins',
  timestamps: true,
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'messageId'],
    },
  ],
})
export class MessagePin extends Model<MessagePin> {
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
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare messageId: number;

  @BelongsTo(() => Message, { onDelete: 'CASCADE' })
  declare message: Message;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare pinnedBy: number;

  @BelongsTo(() => User, { foreignKey: 'pinnedBy', onDelete: 'CASCADE' })
  declare pinner: User;

  @CreatedAt
  declare pinnedAt: Date;
}
