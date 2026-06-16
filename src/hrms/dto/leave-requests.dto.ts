import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ApplyLeaveDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsNotEmpty()
  leaveTypeId: number;

  @IsDateString()
  @IsNotEmpty()
  fromDate: string;

  @IsDateString()
  @IsNotEmpty()
  toDate: string;

  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsEnum(['FIRST_HALF', 'SECOND_HALF'])
  @IsOptional()
  halfDayType?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ApproveLeaveDto {
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class RejectLeaveDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CancelLeaveDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class GetLeaveRequestsFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsNumber()
  @IsOptional()
  employeeId?: number;

  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
