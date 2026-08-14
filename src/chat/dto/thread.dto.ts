import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from '../constants/chat.constants';

export class ReplyInThreadDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT;

  @IsOptional()
  payload?: any;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  attachmentIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  mentionUserIds?: number[];

  @IsOptional()
  @IsString()
  clientMessageId?: string;
}

export class GetThreadRepliesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cursor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 50;
}
