import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested, ArrayMinSize, ArrayMaxSize, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuotationItemDto {
  @IsNumber()
  @IsNotEmpty()
  productId: number;

  @IsOptional()
  @IsString()
  subTypeSpec?: string;

  @IsOptional()
  @IsNumber()
  packagingId?: number;

  /**
   * Auto-derived by the frontend from the selected packaging's packingType.
   * Stored permanently on the item for immutable audit.
   */
  @IsOptional()
  @IsNumber()
  packingTypeId?: number;

  @IsOptional()
  @IsString()
  purity?: string;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  offeredPrice: number;
}

export class CreateQuotationDto {
  @IsNumber()
  @IsNotEmpty()
  buyerId: number;

  @IsOptional()
  @IsNumber()
  importerId?: number;

  @IsString()
  @IsNotEmpty()
  destinationCountry: string;

  @IsOptional()
  @IsNumber()
  followUpId?: number;

  @IsString()
  @IsNotEmpty()
  currencyCode: string;

  /**
   * Phase-1: exactly 1 item (ArrayMinSize(1), ArrayMaxSize(1)).
   * Future multi-product: just remove ArrayMaxSize and update the UI.
   */
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  items: CreateQuotationItemDto[];
}
