import { IsNotEmpty, IsOptional, IsString, IsNumber, IsBoolean, IsArray } from 'class-validator';

export class CreatePortDto {
  @IsOptional()
  @IsNumber()
  country_id?: number;

  @IsOptional()
  @IsNumber()
  countryId?: number;

  @IsOptional()
  @IsString()
  country_name?: string;

  @IsOptional()
  @IsString()
  countryName?: string;

  @IsNotEmpty()
  @IsString()
  port_name?: string;

  @IsOptional()
  @IsString()
  portName?: string;

  @IsOptional()
  @IsString()
  port_code?: string;

  @IsOptional()
  @IsString()
  portCode?: string;

  @IsOptional()
  @IsString()
  unlocode?: string;

  @IsOptional()
  @IsString()
  port_type?: string;

  @IsOptional()
  @IsString()
  portType?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  shipping_line_ids?: number[];

  @IsOptional()
  @IsArray()
  shippingLineIds?: number[];
}
