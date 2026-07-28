import {
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsDate,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EnquiryPurity, EnquiryShipmentType } from '../enquiry.constants';

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
  originCountry?: string;

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
