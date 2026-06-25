import {
  IsString,
  IsInt,
  IsOptional,
  IsNotEmpty,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTaskCommentDto {
  @ApiProperty({ description: 'The content of the comment' })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'ID of the parent comment if this is a reply',
  })
  @IsOptional()
  @IsInt()
  parentCommentId?: number;

  @ApiPropertyOptional({
    description: 'Employee IDs mentioned in this comment',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  mentioneduserIds?: number[];
}

export class UpdateTaskCommentDto {
  @ApiProperty({ description: 'The updated content of the comment' })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'Updated mentioned employee IDs',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  mentioneduserIds?: number[];
}
