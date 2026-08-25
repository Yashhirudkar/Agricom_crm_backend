import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryQuotationDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  buyerId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  importerId?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
