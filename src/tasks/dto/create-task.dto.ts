import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'The title of the task', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description of the task' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID of the TaskStatus' })
  @IsOptional()
  @IsInt()
  statusId?: number;

  @ApiPropertyOptional({ description: 'ID of the TaskPriority' })
  @IsOptional()
  @IsInt()
  priorityId?: number;

  @ApiPropertyOptional({
    description: 'Name of the TaskStatus (auto-resolves)',
  })
  @IsOptional()
  @IsString()
  statusName?: string;

  @ApiPropertyOptional({
    description: 'Name of the TaskPriority (auto-resolves)',
  })
  @IsOptional()
  @IsString()
  priorityName?: string;

  @ApiPropertyOptional({ description: 'ID of the parent Task for subtasks' })
  @IsOptional()
  @IsInt()
  parentTaskId?: number;

  @ApiPropertyOptional({ description: 'Due date in ISO format' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Start date in ISO format' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Estimated time in minutes to complete' })
  @IsOptional()
  @IsInt()
  estimatedMinutes?: number;

  @ApiPropertyOptional({
    description: 'Polymorphic module link (e.g., crm)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityModule?: string;

  @ApiPropertyOptional({
    description: 'Polymorphic table link (e.g., leads)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityTable?: string;

  @ApiPropertyOptional({ description: 'Polymorphic entity ID', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  entityId?: string;

  @ApiPropertyOptional({ description: 'ID of the User who owns/is responsible for the task' })
  @IsOptional()
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional({
    description: 'Array of User IDs to assign',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigneeIds?: number[];

  @ApiPropertyOptional({
    description: 'Array of User IDs to watch the task',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  watcherIds?: number[];

  @ApiPropertyOptional({ description: 'Array of Label IDs', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  labelIds?: number[];
}
