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
import { Message } from './message.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'message_versions',
  timestamps: true,
  updatedAt: false,
  indexes: [
    {
      fields: ['messageId', 'version'],
    },
  ],
})
export class MessageVersion extends Model<MessageVersion> {
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

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare version: number;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare content: string | null;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare payload: any;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare editedBy: number;

  @BelongsTo(() => User, { foreignKey: 'editedBy', onDelete: 'CASCADE' })
  declare editor: User;

  @CreatedAt
  declare createdAt: Date;
}
