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
import { MessagePoll } from './message-poll.model';
import { MessagePollOption } from './message-poll-option.model';
import { User } from '../../users/models/user.model';

@Table({
  tableName: 'message_poll_votes',
  timestamps: true,
  updatedAt: false,
  indexes: [
    {
      unique: true,
      fields: ['pollId', 'optionId', 'userId'],
    },
  ],
})
export class MessagePollVote extends Model<MessagePollVote> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => MessagePoll)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare pollId: number;

  @BelongsTo(() => MessagePoll, { onDelete: 'CASCADE' })
  declare poll: MessagePoll;

  @ForeignKey(() => MessagePollOption)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare optionId: number;

  @BelongsTo(() => MessagePollOption, { onDelete: 'CASCADE' })
  declare option: MessagePollOption;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER, onDelete: 'CASCADE' })
  declare userId: number;

  @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
  declare user: User;

  @CreatedAt
  declare createdAt: Date;
}
