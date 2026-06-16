import { IsString, IsEmail, IsOptional, IsNumber, IsBoolean, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeeStatus, EmploymentType, WorkMode } from '../models/employee.model';
import { DocumentCategory, VerificationStatus } from '../models/employee-document.model';

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  designationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  managerId?: number;

  @IsOptional()
  @IsDateString()
  joiningDate?: Date;

  @IsOptional()
  @IsDateString()
  probationEndDate?: Date;

  @IsOptional()
  @IsDateString()
  confirmationDate?: Date;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @IsOptional()
  @IsString()
  workLocation?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currentAddress?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsBoolean()
  createLogin?: boolean;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number | null;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsNumber()
  companyId?: number;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  designationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  managerId?: number;

  @IsOptional()
  @IsDateString()
  joiningDate?: Date;

  @IsOptional()
  @IsDateString()
  probationEndDate?: Date;

  @IsOptional()
  @IsDateString()
  confirmationDate?: Date;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @IsOptional()
  @IsString()
  workLocation?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactNumber?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currentAddress?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsBoolean()
  createLogin?: boolean;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  newPassword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number | null;
}

export class GetEmployeesFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  designationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class AddDocumentDto {
  @IsEnum(DocumentCategory)
  documentCategory: DocumentCategory;

  @IsString()
  documentType: string;

  @IsOptional()
  @IsString()
  documentName?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: Date;

  @IsOptional()
  @IsDateString()
  expiryDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  notifyBeforeExpiryDays?: number;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

export class VerifyDocumentDto {
  @IsEnum(VerificationStatus)
  verificationStatus: VerificationStatus;

  @IsOptional()
  @IsString()
  verificationRemarks?: string;
}

export class ChangeManagerDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  newManagerId?: number | null;
}

export class TransitionLifecycleDto {
  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}
