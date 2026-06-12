import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum HolidayType {
  PUBLIC = 'PUBLIC',
  COMPANY = 'COMPANY',
  SHUTDOWN = 'SHUTDOWN',
  FESTIVAL = 'FESTIVAL',
  REGIONAL = 'REGIONAL',
}

export class CreateHolidayDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  @IsNotEmpty()
  holidayDate: string;

  @IsEnum(HolidayType)
  @IsNotEmpty()
  holidayType: HolidayType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  companyIds?: number[];
}

export class UpdateHolidayDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsDateString()
  @IsOptional()
  holidayDate?: string;

  @IsEnum(HolidayType)
  @IsOptional()
  holidayType?: HolidayType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  companyIds?: number[];
}

export class GetHolidaysFilterDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(HolidayType)
  @IsOptional()
  holidayType?: HolidayType;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  companyId?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC';
}
