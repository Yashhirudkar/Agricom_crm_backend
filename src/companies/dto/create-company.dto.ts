import { IsString, IsOptional, IsNotEmpty, MaxLength, IsInt, Min } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  subdomain?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxUsers?: number;
}
