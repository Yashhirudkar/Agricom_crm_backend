import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsBoolean, IsArray, IsString } from 'class-validator';

export class UpsertCompanyHrPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultWorkingHoursPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultWeeklyWorkingDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  probationPeriodDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultNoticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  overtimeAllowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  overtimeMultiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lateComingGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  halfDayAfterMinutes?: number;

  @IsOptional()
  @IsArray()
  weeklyOffDays?: any[];

  @IsOptional()
  @IsBoolean()
  allowRemoteWork?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minHoursForPresent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minHoursForHalfDay?: number;

  @IsOptional()
  @IsBoolean()
  allowAttendanceCorrection?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxCorrectionDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  retirementAge?: number;

  @IsOptional()
  @IsString()
  defaultShiftStartTime?: string;

  @IsOptional()
  @IsString()
  defaultShiftEndTime?: string;
}
