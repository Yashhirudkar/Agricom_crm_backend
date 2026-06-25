import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  IsInt,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template title', maxLength: 255 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CloneTemplateDto {
  @ApiPropertyOptional({ description: 'Override title for the cloned task' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Status ID for the new task' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  statusId?: number;

  @ApiPropertyOptional({ description: 'Priority ID for the new task' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  priorityId?: number;
}
