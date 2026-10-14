import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateShippingLineDto {
  @IsNotEmpty()
  @IsString()
  line_name?: string;

  @IsOptional()
  @IsString()
  lineName?: string;

  @IsOptional()
  @IsString()
  line_code?: string;

  @IsOptional()
  @IsString()
  lineCode?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  contact_email?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
