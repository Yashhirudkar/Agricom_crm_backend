import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum FollowUpFilter {
  TODAY = 'today',
  TOMORROW = 'tomorrow',
  OVERDUE = 'overdue',
  UPCOMING = 'upcoming',
  RECENT = 'recent',
}

export class QueryFollowUpDto {
  @IsOptional()
  @IsEnum(FollowUpFilter)
  filter?: FollowUpFilter;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string; // e.g. Pending, Waiting Response, Confirmed, Closed

  @IsOptional()
  @IsString()
  priority?: string; // e.g. Low, Medium, High, Critical

  @IsOptional()
  @IsString()
  communicationType?: string; // e.g. Call, Email, WhatsApp

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
