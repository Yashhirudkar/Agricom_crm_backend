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
import { Attachment } from '../../attachments/models/attachment.model';

@Table({
  tableName: 'message_attachments',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['messageId', 'attachmentId'],
    },
  ],
})
export class MessageAttachment extends Model<MessageAttachment> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Message)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare messageId: number;

  @BelongsTo(() => Message, { onDelete: 'CASCADE' })
  declare message: Message;

  @ForeignKey(() => Attachment)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare attachmentId: number;

  @BelongsTo(() => Attachment, { onDelete: 'CASCADE' })
  declare attachment: Attachment;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
