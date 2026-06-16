import { IsString, IsOptional, IsNumber, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepartmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  departmentCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentDepartmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentHeadId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  departmentCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentDepartmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentHeadId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GetDepartmentsFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
