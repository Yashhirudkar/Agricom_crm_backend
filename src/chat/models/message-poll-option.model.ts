import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { MessagePoll } from './message-poll.model';
import { MessagePollVote } from './message-poll-vote.model';

@Table({
  tableName: 'message_poll_options',
  timestamps: false,
})
export class MessagePollOption extends Model<MessagePollOption> {
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(255) })
  declare optionText: string;

  @HasMany(() => MessagePollVote, { onDelete: 'CASCADE', hooks: true })
  declare votes: MessagePollVote[];
}
