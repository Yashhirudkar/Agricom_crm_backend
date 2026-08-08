import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
} from 'class-validator';
import {
  ConversationType,
  MessageType,
  MemberRole,
  PostingPolicy,
  VisibilityType,
  ConversationClassification,
  EnterpriseSecurityLevel,
  ActionPolicy,
  NotificationPrivacy,
  TypingVisibility,
  PresenceVisibility,
  ExportPolicy,
} from '../constants/chat.constants';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ConversationType)
  @IsNotEmpty()
  type: ConversationType;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  memberUserIds?: number[];

  @IsEnum(VisibilityType)
  @IsOptional()
  visibility?: VisibilityType;

  @IsEnum(ConversationClassification)
  @IsOptional()
  classification?: ConversationClassification;

  @IsEnum(EnterpriseSecurityLevel)
  @IsOptional()
  enterpriseSecurityLevel?: EnterpriseSecurityLevel;

  @IsInt()
  @IsOptional()
  retentionPolicyId?: number;

  @IsEnum(ActionPolicy)
  @IsOptional()
  invitePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  removeMemberPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  renamePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  iconPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  descPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  archivePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  deletePolicy?: ActionPolicy;

  @IsBoolean()
  @IsOptional()
  showInSidebar?: boolean;

  @IsBoolean()
  @IsOptional()
  showInSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  showInMention?: boolean;

  @IsBoolean()
  @IsOptional()
  showInRecentChats?: boolean;

  @IsBoolean()
  @IsOptional()
  showInGlobalSearch?: boolean;

  @IsEnum(NotificationPrivacy)
  @IsOptional()
  notificationPrivacy?: NotificationPrivacy;

  @IsEnum(TypingVisibility)
  @IsOptional()
  typingVisibility?: TypingVisibility;

  @IsEnum(PresenceVisibility)
  @IsOptional()
  presenceVisibility?: PresenceVisibility;

  @IsEnum(ExportPolicy)
  @IsOptional()
  exportPolicy?: ExportPolicy;

  @IsBoolean()
  @IsOptional()
  legalHoldActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFrozen?: boolean;

  @IsOptional()
  dynamicMembershipRules?: any;

  @IsBoolean()
  @IsOptional()
  epHideMetadata?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideApi?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideSocket?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  epNobodyOverride?: boolean;

  // Settings fields
  @IsBoolean()
  @IsOptional()
  allowSend?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPin?: boolean;

  @IsEnum(ActionPolicy)
  @IsOptional()
  pinPolicy?: ActionPolicy;

  @IsBoolean()
  @IsOptional()
  allowDownload?: boolean;

  @IsBoolean()
  @IsOptional()
  disableCopy?: boolean;

  @IsBoolean()
  @IsOptional()
  screenshotProtectionBestEffort?: boolean;

  @IsBoolean()
  @IsOptional()
  disablePrint?: boolean;

  @IsBoolean()
  @IsOptional()
  allowForward?: boolean;

  @IsBoolean()
  @IsOptional()
  allowReply?: boolean;

  @IsBoolean()
  @IsOptional()
  allowEdit?: boolean;

  @IsBoolean()
  @IsOptional()
  allowDelete?: boolean;

  @IsBoolean()
  @IsOptional()
  allowReaction?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPoll?: boolean;

  @IsBoolean()
  @IsOptional()
  allowMention?: boolean;

  @IsBoolean()
  @IsOptional()
  allowExport?: boolean;

  @IsArray()
  @IsOptional()
  permissionOverrides?: any[];
}

export class UpdateConversationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;

  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;

  @IsBoolean()
  @IsOptional()
  announcementMode?: boolean;

  @IsEnum(VisibilityType)
  @IsOptional()
  visibility?: VisibilityType;

  @IsEnum(ConversationClassification)
  @IsOptional()
  classification?: ConversationClassification;

  @IsEnum(EnterpriseSecurityLevel)
  @IsOptional()
  enterpriseSecurityLevel?: EnterpriseSecurityLevel;

  @IsInt()
  @IsOptional()
  retentionPolicyId?: number;

  @IsEnum(ActionPolicy)
  @IsOptional()
  invitePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  removeMemberPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  renamePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  iconPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  descPolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  archivePolicy?: ActionPolicy;

  @IsEnum(ActionPolicy)
  @IsOptional()
  deletePolicy?: ActionPolicy;

  @IsBoolean()
  @IsOptional()
  showInSidebar?: boolean;

  @IsBoolean()
  @IsOptional()
  showInSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  showInMention?: boolean;

  @IsBoolean()
  @IsOptional()
  showInRecentChats?: boolean;

  @IsBoolean()
  @IsOptional()
  showInGlobalSearch?: boolean;

  @IsEnum(NotificationPrivacy)
  @IsOptional()
  notificationPrivacy?: NotificationPrivacy;

  @IsEnum(TypingVisibility)
  @IsOptional()
  typingVisibility?: TypingVisibility;

  @IsEnum(PresenceVisibility)
  @IsOptional()
  presenceVisibility?: PresenceVisibility;

  @IsEnum(ExportPolicy)
  @IsOptional()
  exportPolicy?: ExportPolicy;

  @IsBoolean()
  @IsOptional()
  legalHoldActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFrozen?: boolean;

  @IsOptional()
  dynamicMembershipRules?: any;

  @IsBoolean()
  @IsOptional()
  epHideMetadata?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideApi?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideSocket?: boolean;

  @IsBoolean()
  @IsOptional()
  epHideSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  epNobodyOverride?: boolean;

  // Settings fields
  @IsBoolean()
  @IsOptional()
  allowSend?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPin?: boolean;

  @IsEnum(ActionPolicy)
  @IsOptional()
  pinPolicy?: ActionPolicy;

  @IsBoolean()
  @IsOptional()
  allowDownload?: boolean;

  @IsBoolean()
  @IsOptional()
  disableCopy?: boolean;

  @IsBoolean()
  @IsOptional()
  screenshotProtectionBestEffort?: boolean;

  @IsBoolean()
  @IsOptional()
  disablePrint?: boolean;

  @IsBoolean()
  @IsOptional()
  allowForward?: boolean;

  @IsBoolean()
  @IsOptional()
  allowReply?: boolean;

  @IsBoolean()
  @IsOptional()
  allowEdit?: boolean;

  @IsBoolean()
  @IsOptional()
  allowDelete?: boolean;

  @IsBoolean()
  @IsOptional()
  allowReaction?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPoll?: boolean;

  @IsBoolean()
  @IsOptional()
  allowMention?: boolean;

  @IsBoolean()
  @IsOptional()
  allowExport?: boolean;

  @IsArray()
  @IsOptional()
  permissionOverrides?: any[];
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(MessageType)
  @IsNotEmpty()
  type: MessageType;

  @IsInt()
  @IsOptional()
  parentId?: number;

  @IsInt()
  @IsOptional()
  attachmentId?: number;

  @IsOptional()
  payload?: any;
}

export class ReactMessageDto {
  @IsString()
  @IsNotEmpty()
  reaction: string;
}

export class AddMemberDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;
}

export class UpdateMemberRoleDto {
  @IsEnum(MemberRole)
  @IsNotEmpty()
  role: MemberRole;
}

export class MuteMemberDto {
  @IsBoolean()
  @IsNotEmpty()
  mute: boolean;

  @IsInt()
  @IsOptional()
  durationMinutes?: number;
}

/**
 * DTO for PATCH /conversations/:id/posting-policy
 * Controls who can send messages in a CHANNEL conversation.
 */
export class UpdatePostingPolicyDto {
  @IsEnum(PostingPolicy)
  @IsNotEmpty()
  postingPolicy: PostingPolicy;

  /**
   * Required when postingPolicy = SELECTED_USERS.
   * Array of userId numbers that are allowed to post.
   */
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  allowedPosters?: number[];

  /**
   * Required when postingPolicy = SELECTED_ROLES.
   * Array of role name strings (e.g. ["HR_MANAGER", "DIRECTOR"]).
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRoles?: string[];
}
