import { IsString, IsOptional, MaxLength, IsInt, Min, IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCompanyDto {
  @IsInt()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  subdomain?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxUsers?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
