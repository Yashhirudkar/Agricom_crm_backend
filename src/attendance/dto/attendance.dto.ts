import {
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEnum,
  Matches,
} from 'class-validator';
import { AttendanceExceptionType } from '../models/attendance-exception.model';
import { AttendanceStatus } from '../models/attendance-record.model';

export class CheckInDto {
  @IsNumber()
  @IsOptional()
  declare locationLat?: number;

  @IsNumber()
  @IsOptional()
  declare locationLng?: number;

  @IsNumber()
  @IsOptional()
  declare shiftId?: number;

  @IsString()
  @IsOptional()
  declare biometricVerificationId?: string;

  @IsString()
  @IsOptional()
  declare verificationMethod?: string;
}

export class CheckOutDto {
  @IsNumber()
  @IsOptional()
  declare locationLat?: number;

  @IsNumber()
  @IsOptional()
  declare locationLng?: number;

  @IsString()
  @IsOptional()
  declare biometricVerificationId?: string;

  @IsString()
  @IsOptional()
  declare verificationMethod?: string;
}

export class BreakStartDto {
  @IsNumber()
  @IsOptional()
  declare locationLat?: number;

  @IsNumber()
  @IsOptional()
  declare locationLng?: number;
}

export class BreakEndDto {
  @IsNumber()
  @IsOptional()
  declare locationLat?: number;

  @IsNumber()
  @IsOptional()
  declare locationLng?: number;
}

export class RequestCorrectionDto {
  @IsEnum(AttendanceExceptionType)
  @IsNotEmpty()
  declare requestType: AttendanceExceptionType;

  @IsString()
  @IsNotEmpty()
  declare reason: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  declare date: string;

  @IsString()
  @IsOptional()
  declare checkInTime?: string; // ISO date-time string (e.g. "2026-06-17T09:00:00.000Z")

  @IsString()
  @IsOptional()
  declare checkOutTime?: string; // ISO date-time string (e.g. "2026-06-17T18:00:00.000Z")
}

export class ResolveCorrectionDto {
  @IsString()
  @IsOptional()
  declare remarks?: string;
}

export class AssignShiftDto {
  @IsNumber()
  @IsNotEmpty()
  declare shiftId: number;
}

export class ManualAttendanceDto {
  @IsNumber()
  @IsNotEmpty()
  declare employeeId: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  declare date: string;

  @IsString()
  @IsOptional()
  declare checkInTime?: string;

  @IsString()
  @IsOptional()
  declare checkOutTime?: string;

  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  declare status: AttendanceStatus;

  @IsNumber()
  @IsOptional()
  declare leaveTypeId?: number;

  @IsString()
  @IsOptional()
  declare reason?: string;
}
