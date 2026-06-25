import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TaskQueryDto {
  @ApiPropertyOptional({
    description: 'Pre-configured query preset',
    enum: [
      'my_tasks',
      'overdue_tasks',
      'assigned_by_me',
      'completed_tasks',
      'high_priority_tasks',
    ],
  })
  @IsOptional()
  @IsString()
  preset?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Search term for title, description, or task code',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: [
      'createdAt',
      'updatedAt',
      'dueDate',
      'priorityId',
      'statusId',
      'title',
    ],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn([
    'createdAt',
    'updatedAt',
    'dueDate',
    'priorityId',
    'statusId',
    'title',
  ])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';

  @ApiPropertyOptional({ description: 'Filter by Status IDs', type: [Number] })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((v) => parseInt(v, 10)),
  )
  statusIds?: number[];

  @ApiPropertyOptional({
    description: 'Filter by Priority IDs',
    type: [Number],
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((v) => parseInt(v, 10)),
  )
  priorityIds?: number[];

  @ApiPropertyOptional({
    description: 'Filter by Assignee User IDs',
    type: [Number],
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((v) => parseInt(v, 10)),
  )
  assigneeIds?: number[];

  @ApiPropertyOptional({
    description: 'Filter by Creator User IDs',
    type: [Number],
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((v) => parseInt(v, 10)),
  )
  createdByIds?: number[];

  @ApiPropertyOptional({ description: 'Filter by archive status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Filter by completion status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Filter explicitly for overdue tasks' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Filter by parent task ID' })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  parentTaskId?: number;

  @ApiPropertyOptional({ description: 'Polymorphic module name' })
  @IsOptional()
  @IsString()
  entityModule?: string;

  @ApiPropertyOptional({ description: 'Polymorphic table name' })
  @IsOptional()
  @IsString()
  entityTable?: string;

  @ApiPropertyOptional({ description: 'Polymorphic entity ID' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Due date range start (ISO Date)' })
  @IsOptional()
  @IsDateString()
  dueDateStart?: string;

  @ApiPropertyOptional({ description: 'Due date range end (ISO Date)' })
  @IsOptional()
  @IsDateString()
  dueDateEnd?: string;

  @ApiPropertyOptional({ description: 'Creation date range start (ISO Date)' })
  @IsOptional()
  @IsDateString()
  createdAtStart?: string;

  @ApiPropertyOptional({ description: 'Creation date range end (ISO Date)' })
  @IsOptional()
  @IsDateString()
  createdAtEnd?: string;
}
