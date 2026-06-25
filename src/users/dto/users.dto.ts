import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserCompanyDto {
  @IsNumber()
  companyId: number;

  @IsOptional()
  @IsNumber()
  roleId?: number;

  @IsOptional()
  @IsBoolean()
  remove?: boolean;
}

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserCompanyDto)
  companies?: UserCompanyDto[];
}

export class UpdateUserDto {
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
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserCompanyDto)
  companies?: UserCompanyDto[];
}

export class DeleteUserDto {
  @IsNumber()
  id: number;
}

export class AssignUserToCompanyDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  companyId: number;

  @IsOptional()
  @IsNumber()
  roleId?: number;
}

export class RemoveUserFromCompanyDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  companyId: number;
}

export class UpdateUserCompanyRoleDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  companyId: number;

  @IsOptional()
  @IsNumber()
  roleId?: number | null;
}

export class GetUsersFilterDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class VerifyInvitationDto {
  @IsString()
  token: string;
}

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsString()
  name: string;

  @IsString()
  password: string;
}
