import { IsString, IsOptional, IsNumber, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDesignationDto {
  @IsNumber()
  departmentId: number;

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
  designationCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  level?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentDesignationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBandMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBandMax?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDesignationDto {
  @IsOptional()
  @IsNumber()
  departmentId?: number;

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
  designationCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  level?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentDesignationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBandMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBandMax?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GetDesignationsFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

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
