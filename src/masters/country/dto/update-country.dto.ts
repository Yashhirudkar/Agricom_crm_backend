import {
  IsString,
  IsOptional,
  IsBoolean,
  Length,
  IsNotEmpty,
} from 'class-validator';

export class UpdateCountryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  iso2Code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  iso3Code?: string;

  @IsOptional()
  @IsString()
  phoneCode?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
