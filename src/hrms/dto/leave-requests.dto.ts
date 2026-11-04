import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsArray,
  ArrayMinSize,
  IsInt,
} from 'class-validator';
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

  @Transform(
    ({ value }) =>
      value === 'true' || value === true || value === 1 || value === '1',
  )
  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsEnum(['FIRST_HALF', 'SECOND_HALF'])
  @IsOptional()
  halfDayType?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(Number).filter((n) => !isNaN(n));
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map(Number).filter((n) => !isNaN(n));
        }
      } catch {
        return value
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n));
      }
    }
    const num = Number(value);
    return isNaN(num) ? [] : [num];
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Minimum 1 employee is required for work handover',
  })
  @IsInt({ each: true })
  handoverUserIds: number[];
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

export class CancelApprovedLeaveDto {
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is mandatory' })
  reason: string;
}

export class CancelLeaveDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class GetLeaveRequestsFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

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
  @Type(() => Number)
  employeeId?: number;

  @IsEnum([
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'CANCELLED_AFTER_APPROVAL',
  ])
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  leaveTypeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @IsOptional()
  @IsString()
  month?: string;
}

export class GetPaginatedLeaveRequestsDto {
  /** Tab: PENDING or HISTORY (APPROVED | REJECTED | CANCELLED) */
  @IsEnum(['PENDING', 'HISTORY'])
  @IsOptional()
  tab?: 'PENDING' | 'HISTORY';

  /** Opaque base64url-encoded cursor from previous page */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Page size, server enforces max=50, default=30 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
