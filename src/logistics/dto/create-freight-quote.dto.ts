import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FreightQuoteChargeDto {
  @IsOptional()
  @IsInt()
  chargeMasterId?: number;

  @IsNotEmpty({ message: 'Charge Type is required.' })
  @IsString()
  chargeName: string;

  @IsNotEmpty({ message: 'Amount is required.' })
  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than zero.' })
  amount: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class FreightQuoteContainerRateDto {
  @IsNotEmpty()
  @IsString()
  containerType: string;

  @IsNotEmpty()
  @IsString()
  containerSize: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightQuoteChargeDto)
  charges?: FreightQuoteChargeDto[];
}

export class CreateFreightQuoteDto {
  @IsNotEmpty()
  @IsDateString()
  quoteDate: string;

  @IsOptional()
  @IsInt()
  sellerId?: number;

  @IsOptional()
  @IsInt()
  seller_id?: number;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  freightAmount?: number;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  transitDays?: number;

  @IsOptional()
  @IsDateString()
  validityDate?: string;

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

  @IsOptional()
  @IsString()
  truckType?: string;

  @IsOptional()
  @IsString()
  truckCapacity?: string;

  @IsOptional()
  @IsString()
  wagonType?: string;

  @IsOptional()
  @IsString()
  wagonCapacity?: string;

  @IsOptional()
  @IsNumber()
  routeId?: number;

  @IsOptional()
  @IsNumber()
  productId?: number;

  @IsOptional()
  @IsString()
  loadingPoint?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightQuoteChargeDto)
  charges?: FreightQuoteChargeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightQuoteContainerRateDto)
  containerRates?: FreightQuoteContainerRateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightRouteDto)
  freightRoutes?: FreightRouteDto[];
}

export class FreightRateDto {
  @IsNotEmpty()
  @IsInt()
  partnerId: number;

  @IsOptional()
  @IsString()
  equipment?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  transitDays?: number;

  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  validTill?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class FreightRouteDto {
  @IsNotEmpty()
  @IsString()
  origin: string;

  @IsNotEmpty()
  @IsString()
  destination: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FreightRateDto)
  rates: FreightRateDto[];
}

export class UpdateFreightQuoteDto extends CreateFreightQuoteDto {}
