import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsDateString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartnerDnbReportDto {
  @IsDateString()
  @IsNotEmpty()
  reportDate: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['LOW', 'MODERATE', 'HIGH'])
  riskFactor: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  creditLimit: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  failureScore: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  paydex: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  dnbRating: string;

  @IsOptional()
  @IsString()
  @IsIn(['MANUAL', 'DNB_API', 'IMPORT'])
  source?: string;
}
