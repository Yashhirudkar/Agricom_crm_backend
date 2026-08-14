import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { MessageType } from '../constants/chat.constants';

export class CreateScheduledMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT;

  @IsOptional()
  payload?: any;

  @IsDateString()
  scheduledFor: string;
}
