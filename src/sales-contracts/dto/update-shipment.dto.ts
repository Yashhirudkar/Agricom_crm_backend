import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateShipmentDto {
  @IsOptional()
  @IsDateString()
  shipmentDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  noOfContainers?: number;

  @IsOptional()
  @IsNumber()
  ratePerMt?: number;

  @IsOptional()
  @IsNumber()
  purchaseRate?: number;

  @IsOptional()
  @IsNumber()
  forex?: number;

  @IsOptional()
  @IsNumber()
  freight?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  shipmentNo?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
