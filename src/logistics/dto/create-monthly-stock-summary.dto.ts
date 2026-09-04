import {
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsArray,
  IsOptional,
  IsString,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CountryInputDto {
  @IsNotEmpty()
  @IsString()
  iso2Code: string;

  @IsNotEmpty()
  @IsString()
  countryName: string;
}

export class CreateMonthlyStockSummaryDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  year: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountryInputDto)
  countries: CountryInputDto[];

  @IsOptional()
  @IsString()
  @IsIn(['Draft', 'Published'])
  status?: string = 'Draft';
}

export class UpdateMonthlyStockSummaryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountryInputDto)
  countries?: CountryInputDto[];

  @IsOptional()
  @IsString()
  @IsIn(['Draft', 'Published'])
  status?: string;
}
