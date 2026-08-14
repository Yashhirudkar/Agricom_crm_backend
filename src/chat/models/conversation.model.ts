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
import { RetentionPolicy } from './retention-policy.model';
import { ConversationPermissionOverride } from './conversation-permission-override.model';
import {
  ConversationType,
  PostingPolicy,
  VisibilityType,
  EnterpriseSecurityLevel,
  ConversationClassification,
  NotificationPrivacy,
  TypingVisibility,
  PresenceVisibility,
  ActionPolicy,
  ExportPolicy,
} from '../constants/chat.constants';

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

  @AllowNull(false)
  @Default(VisibilityType.MEMBERS_ONLY)
  @Column({
    type: DataType.ENUM(...Object.values(VisibilityType)),
  })
  declare visibility: VisibilityType;

  @AllowNull(false)
  @Default(ConversationClassification.INTERNAL)
  @Column({
    type: DataType.ENUM(...Object.values(ConversationClassification)),
  })
  declare classification: ConversationClassification;

  @AllowNull(false)
  @Default(EnterpriseSecurityLevel.STANDARD)
  @Column({
    type: DataType.ENUM(...Object.values(EnterpriseSecurityLevel)),
  })
  declare enterpriseSecurityLevel: EnterpriseSecurityLevel;

  @ForeignKey(() => RetentionPolicy)
  @AllowNull(true)
  @Column({ type: DataType.INTEGER, onDelete: 'SET NULL' })
  declare retentionPolicyId: number | null;

  @AllowNull(false)
  @Default(ActionPolicy.MEMBER)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare invitePolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare removeMemberPolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare renamePolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare iconPolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare descPolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare archivePolicy: ActionPolicy;

  @AllowNull(false)
  @Default(ActionPolicy.OWNER)
  @Column({
    type: DataType.ENUM(...Object.values(ActionPolicy)),
  })
  declare deletePolicy: ActionPolicy;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare showInSidebar: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare showInSearch: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare showInMention: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare showInRecentChats: boolean;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare showInGlobalSearch: boolean;

  @AllowNull(false)
  @Default(NotificationPrivacy.MEMBERS_ONLY)
  @Column({
    type: DataType.ENUM(...Object.values(NotificationPrivacy)),
  })
  declare notificationPrivacy: NotificationPrivacy;

  @AllowNull(false)
  @Default(TypingVisibility.MEMBERS_ONLY)
  @Column({
    type: DataType.ENUM(...Object.values(TypingVisibility)),
  })
  declare typingVisibility: TypingVisibility;

  @AllowNull(false)
  @Default(PresenceVisibility.EVERYONE)
  @Column({
    type: DataType.ENUM(...Object.values(PresenceVisibility)),
  })
  declare presenceVisibility: PresenceVisibility;

  @AllowNull(false)
  @Default('EVERYONE')
  @Column({ type: DataType.STRING(50) })
  declare fileVisibility: string;

  @AllowNull(false)
  @Default(ExportPolicy.ADMIN)
  @Column({
    type: DataType.ENUM(...Object.values(ExportPolicy)),
  })
  declare exportPolicy: ExportPolicy;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare legalHoldActive: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare isFrozen: boolean;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare dynamicMembershipRules: any;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare epHideMetadata: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare epHideApi: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare epHideSocket: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare epHideSearch: boolean;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare epNobodyOverride: boolean;

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

  @BelongsTo(() => RetentionPolicy)
  declare retentionPolicy: RetentionPolicy | null;

  @HasMany(() => ConversationPermissionOverride, { onDelete: 'CASCADE', hooks: true })
  declare permissionOverrides: ConversationPermissionOverride[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @DeletedAt
  declare deletedAt: Date | null;
}
