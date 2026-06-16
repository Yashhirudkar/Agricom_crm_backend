import { IsString, IsOptional } from 'class-validator';

export class UpdateEmergencyContactDto {
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @IsString()
  updatedAt: Date; // For optimistic locking
}
