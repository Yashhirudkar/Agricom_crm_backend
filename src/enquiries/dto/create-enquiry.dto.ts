import {
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsDate,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EnquiryPurity, EnquiryShipmentType, EnquiryShipmentMode } from '../enquiry.constants';

export class CreateEnquiryDto {
  @IsInt()
  partnerRoleId: number;

  @IsInt()
  partnerId: number;

  @IsInt()
  productId: number;

  @Type(() => Date)
  @IsDate()
  enquiryDate: Date;

  @IsOptional()
  @IsString()
  originCountryId?: string;

  @IsOptional()
  @IsEnum(EnquiryShipmentMode)
  shipmentMode?: EnquiryShipmentMode;

  @IsOptional()
  @IsString()
  originPort?: string;

  @IsOptional()
  @IsString()
  destinationPort?: string;

  @IsOptional()
  @IsString()
  originState?: string;

  @IsOptional()
  @IsString()
  originCity?: string;

  @IsOptional()
  @IsString()
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  destinationState?: string;

  @IsOptional()
  @IsString()
  destinationCity?: string;

  @IsOptional()
  @IsString()
  originZipCode?: string;

  @IsOptional()
  @IsString()
  destinationZipCode?: string;

  @IsOptional()
  @IsString()
  originStationCode?: string;

  @IsOptional()
  @IsString()
  destinationStationCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bidCurrency?: string;

  @IsOptional()
  @IsEnum(EnquiryPurity)
  purity?: EnquiryPurity;

  @IsOptional()
  @IsInt()
  packingTypeId?: number;

  @IsOptional()
  @IsString()
  podPort?: string;

  @IsOptional()
  @IsEnum(EnquiryShipmentType)
  shipmentType?: EnquiryShipmentType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  shipmentDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyingInterest?: number;

  @IsOptional()
  @IsBoolean()
  potentialEnquiry?: boolean;
}

