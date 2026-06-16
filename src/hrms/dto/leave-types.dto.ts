import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsNotEmpty()
  daysPerYear: number;

  @IsNumber()
  @IsOptional()
  minimumServiceDays?: number;

  @IsBoolean()
  @IsOptional()
  applicableAfterProbation?: boolean;

  @IsBoolean()
  @IsOptional()
  encashable?: boolean;

  @IsBoolean()
  @IsOptional()
  carryForwardAllowed?: boolean;

  @IsNumber()
  @IsOptional()
  maxCarryForwardDays?: number;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsBoolean()
  @IsOptional()
  allowHalfDay?: boolean;

  @IsEnum(['MALE', 'FEMALE'])
  @IsOptional()
  genderRestriction?: string;

  @IsEnum(['MARRIED', 'UNMARRIED'])
  @IsOptional()
  maritalRestriction?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateLeaveTypeDto extends CreateLeaveTypeDto {}
