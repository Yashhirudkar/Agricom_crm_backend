import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPurchaseContractDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  buyerId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salesContractId?: number;

  @IsOptional()
  @IsString()
  financialYear?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
