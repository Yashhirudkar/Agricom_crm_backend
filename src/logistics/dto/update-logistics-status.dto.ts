import { IsOptional, IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class UpdateLogisticsStatusDto {
  @IsNotEmpty()
  @IsString()
  status: string;

  @IsOptional()
  @IsDateString()
  estimatedDispatchDate?: string;

  @IsOptional()
  @IsDateString()
  estimatedArrivalDate?: string;

  @IsOptional()
  @IsDateString()
  actualDispatchDate?: string;

  @IsOptional()
  @IsDateString()
  actualArrivalDate?: string;

  @IsOptional()
  @IsString()
  transportMode?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
