import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsInt,
  IsBoolean,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsInt()
  @IsOptional()
  clientId?: number;

  @IsBoolean()
  @IsOptional()
  isSystemRole?: boolean;
}
