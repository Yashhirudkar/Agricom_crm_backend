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
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdatePartnerContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(100)
  designation?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(50)
  communicationType?: string | null;

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  country?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : Number(value),
  )
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  yearOfEstablishment?: number | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(1000)
  loadingAddress?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(50)
  taxId?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(50)
  panNo?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(50)
  innNo?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MaxLength(100)
  financialStatus?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  productNotes?: string | null;

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
