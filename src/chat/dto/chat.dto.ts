import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { ConversationType, MessageType, MemberRole } from '../constants/chat.constants';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  name?: string;

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
