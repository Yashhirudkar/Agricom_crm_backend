import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { ConversationType, MessageType, MemberRole, PostingPolicy } from '../constants/chat.constants';

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
