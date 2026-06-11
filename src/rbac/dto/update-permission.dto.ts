import { IsString, IsOptional, IsNotEmpty, MaxLength, IsBoolean, IsInt } from 'class-validator';

export class UpdatePermissionDto {
  @IsInt()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  resource?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  action?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
