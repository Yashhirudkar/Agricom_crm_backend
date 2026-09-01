import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateFreightQuoteDto {
  @IsNotEmpty()
  @IsDateString()
  quoteDate: string;

  @IsNotEmpty()
  @IsInt()
  sellerId: number;

  @IsOptional()
  @IsString()
  carrierReferenceNo?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  containerType?: string;

  @IsOptional()
  @IsString()
  shippingLine?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  freightAmount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fuelCharges?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalCharges?: number;

  @IsNotEmpty()
  @IsInt()
  @Min(0)
  transitDays: number;

  @IsNotEmpty()
  @IsDateString()
  validityDate: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  pol?: string;

  @IsOptional()
  @IsString()
  pod?: string;

  @IsOptional()
  @IsDateString()
  etd?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeDays?: number;

  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @IsOptional()
  @IsString()
  vessel?: string;

  @IsOptional()
  @IsString()
  voyage?: string;

  @IsOptional()
  @IsString()
  containerSize?: string;
}

export class UpdateFreightQuoteDto extends CreateFreightQuoteDto {}
