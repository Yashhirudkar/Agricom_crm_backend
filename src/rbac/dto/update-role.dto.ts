import { IsString, IsOptional, IsNotEmpty, MaxLength, IsBoolean, IsInt } from 'class-validator';

export class UpdateRoleDto {
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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
