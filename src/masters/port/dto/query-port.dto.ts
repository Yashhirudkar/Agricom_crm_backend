import { IsOptional, IsString } from 'class-validator';

export class QueryPortDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsString()
  country_id?: string;

  @IsOptional()
  @IsString()
  portType?: string;

  @IsOptional()
  @IsString()
  port_type?: string;

  @IsOptional()
  @IsString()
  shippingLineId?: string;

  @IsOptional()
  @IsString()
  shipping_line_id?: string;

  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsString()
  is_active?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
