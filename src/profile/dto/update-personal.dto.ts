import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class UpdatePersonalDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  personalEmail?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsEnum(['Male', 'Female', 'Other'])
  gender?: string;

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

  @IsString()
  updatedAt: Date; // For optimistic locking
}
