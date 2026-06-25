import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsNotEmpty,
  IsEmail,
  ValidateNested,
  IsArray,
  IsInt,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePartnerContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  communicationType?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  entityName?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  partnerRoleId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  countryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  panNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  innNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  financialStatus?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UpdatePartnerContactDto)
  contacts?: UpdatePartnerContactDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Type(() => Number)
  productIds?: number[];
}
