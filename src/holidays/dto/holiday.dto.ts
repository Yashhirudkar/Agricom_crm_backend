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

  @IsBoolean()
  @IsOptional()
  isWeeklyOff?: boolean;

  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsString()
  @IsOptional()
  halfDayStart?: string;

  @IsString()
  @IsOptional()
  halfDayEnd?: string;

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

  @IsBoolean()
  @IsOptional()
  isWeeklyOff?: boolean;

  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsString()
  @IsOptional()
  halfDayStart?: string;

  @IsString()
  @IsOptional()
  halfDayEnd?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  companyIds?: number[];
}

export class CreateRecurringHolidayDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(HolidayType)
  @IsNotEmpty()
  holidayType: HolidayType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;

  @IsBoolean()
  @IsOptional()
  isWeeklyOff?: boolean;

  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsString()
  @IsOptional()
  halfDayStart?: string;

  @IsString()
  @IsOptional()
  halfDayEnd?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  companyIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  weekdays: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  occurrences: number[];

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;
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
