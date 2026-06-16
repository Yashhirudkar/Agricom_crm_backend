import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @IsString()
  @IsNotEmpty()
  branchCode: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  managerId?: number;

  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  geoFenceRadius?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workingDays?: string[];

  @IsOptional()
  @IsString()
  holidayCalendarCode?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  managerId?: number;

  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  geoFenceRadius?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workingDays?: string[];

  @IsOptional()
  @IsString()
  holidayCalendarCode?: string;
}

export class GetBranchesFilterDto {
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
}
