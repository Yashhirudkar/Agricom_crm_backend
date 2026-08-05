import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  HasMany,
  PrimaryKey,
  AutoIncrement,
  Default,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  ForeignKey,
  BelongsTo,
  Index,
  HasOne,
} from 'sequelize-typescript';
import { Client } from '../../clients/models/client.model';
import { Company } from '../../companies/models/company.model';
import { User } from '../../users/models/user.model';
import { ConversationMember } from './conversation-member.model';
import { Message } from './message.model';
import { ConversationSetting } from './conversation-setting.model';
import { ConversationType, PostingPolicy } from '../constants/chat.constants';

@Table({
  tableName: 'conversations',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      fields: ['clientId'],
    },
    {
      fields: ['companyId'],
    },
    {
      fields: ['entityType', 'entityId'],
    },
  ],
})
export class Conversation extends Model<Conversation> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.INTEGER })
  declare id: number;

  @ForeignKey(() => Client)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare clientId: number | null;

  @BelongsTo(() => Client, { onDelete: 'CASCADE' })
  declare client: Client | null;

  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare companyId: number | null;

  @BelongsTo(() => Company, { onDelete: 'CASCADE' })
  declare company: Company | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare name: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare avatarUrl: string | null;

  @AllowNull(false)
  @Default(ConversationType.GROUP)
  @Column({
    type: DataType.ENUM(ConversationType.DIRECT, ConversationType.GROUP, ConversationType.CHANNEL),
  })
  declare type: ConversationType;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare entityType: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare entityId: string | null;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isArchived: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isLocked: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare announcementMode: boolean;

  /**
   * Channel posting policy — who can send messages.
   * Only applies when type is CHANNEL or ANNOUNCEMENT.
   * Defaults to EVERYONE (backward compatible with existing channels).
   */
  @AllowNull(false)
  @Default(PostingPolicy.EVERYONE)
  @Column({
    type: DataType.ENUM(...Object.values(PostingPolicy)),
  })
  declare postingPolicy: PostingPolicy;

  /**
   * User IDs allowed to post — used when postingPolicy = SELECTED_USERS.
   * Stored as JSON array of numbers.
   */
  @AllowNull(true)
  @Default([])
  @Column({ type: DataType.JSONB })
  declare allowedPosters: number[];

  /**
   * Role names allowed to post — used when postingPolicy = SELECTED_ROLES.
   * Stored as JSON array of strings (e.g. ["HR_MANAGER", "DIRECTOR"]).
   */
  @AllowNull(true)
  @Default([])
  @Column({ type: DataType.JSONB })
  declare allowedRoles: string[];

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER })
  declare createdBy: number | null;

  @BelongsTo(() => User, { foreignKey: 'createdBy', onDelete: 'SET NULL' })
  declare creator: User | null;

  @HasMany(() => ConversationMember, { onDelete: 'CASCADE', hooks: true })
  declare members: ConversationMember[];

  @HasMany(() => Message, { onDelete: 'CASCADE', hooks: true })
  declare messages: Message[];

  @HasOne(() => ConversationSetting, { onDelete: 'CASCADE', hooks: true })
  declare settings: ConversationSetting;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;
}
