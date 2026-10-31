import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryStockDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  buyer?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cropYear?: string;

  @IsOptional()
  @IsString()
  packing?: string;

  @IsOptional()
  @IsString()
  incoterm?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  sortBy?: string = 'country';

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string = 'ASC';
}
