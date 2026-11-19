import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateShipmentTypeDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsInt()
  stageOrder?: number;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  purchaseContractDeliveryPlaceRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  salesContractDeliveryPlaceRequired?: boolean;
}
