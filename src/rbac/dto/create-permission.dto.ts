import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  resource: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  action: string;
}
