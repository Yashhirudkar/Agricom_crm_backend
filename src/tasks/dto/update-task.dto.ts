import {
  IsString,
  IsInt,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
  IsNotEmpty,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiProperty({
    description: 'Version number required for optimistic locking protection',
  })
  @IsNotEmpty()
  @IsInt()
  version: number;

  @ApiPropertyOptional({ description: 'The title of the task' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
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

  @ApiPropertyOptional({ description: 'Actual time spent in minutes' })
  @IsOptional()
  @IsInt()
  actualMinutes?: number;

  @ApiPropertyOptional({
    description: 'Percentage completed (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercentage?: number;

  @ApiPropertyOptional({ description: 'Flag to archive the task' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'ID of the User who owns/is responsible for the task' })
  @IsOptional()
  @IsInt()
  ownerId?: number;

  @ApiPropertyOptional({
    description: 'Array of User IDs to assign to the associated team',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigneeIds?: number[];
}
