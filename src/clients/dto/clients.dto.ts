import { IsString, IsEmail, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateClientDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsNumber()
  allowedCompanies?: number;

  @IsOptional()
  @IsNumber()
  allowedUsers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClientDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  allowedCompanies?: number;

  @IsOptional()
  @IsNumber()
  allowedUsers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DeleteClientDto {
  @IsNumber()
  id: number;
}
