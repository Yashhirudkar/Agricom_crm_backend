import { IsOptional, IsNumber, IsString, ValidateNested, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateQuotationItemDto {
  @IsOptional()
  @IsNumber()
  packagingId?: number;

  @IsOptional()
  @IsNumber()
  packingTypeId?: number;

  @IsOptional()
  @IsString()
  subTypeSpec?: string;

  @IsOptional()
  @IsString()
  purity?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  offeredPrice?: number;
}

export class UpdateQuotationDto {
  @IsOptional()
  @IsNumber()
  importerId?: number;

  @IsOptional()
  @IsString()
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuotationItemDto)
  items?: UpdateQuotationItemDto[];
}
