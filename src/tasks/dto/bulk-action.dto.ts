import { IsBoolean, IsArray, IsOptional, IsNumber, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskQueryDto } from './task-query.dto';

export class BulkActionDto {
  @IsBoolean()
  selectAll: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  excludedIds: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];

  @IsObject()
  @ValidateNested()
  @Type(() => TaskQueryDto)
  filters: TaskQueryDto;
}

export class BulkArchiveDto extends BulkActionDto {
  @IsBoolean()
  isArchived: boolean;
}

export class BulkStatusDto extends BulkActionDto {
  @IsNumber()
  statusId: number;

  @IsOptional()
  @IsNumber()
  version?: number;
}
