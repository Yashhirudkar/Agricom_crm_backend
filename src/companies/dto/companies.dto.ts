import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEmail,
  IsUrl,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';

// ─── Create ──────────────────────────────────────────────────────────────────

export class CreateCompanyDto {
  // Basic (required)
  @IsString()
  @MaxLength(255)
  name: string;

  // Tenant context — super_admin provides this manually
  @IsOptional()
  @IsNumber()
  clientId?: number;

  // Basic Info (optional at create, fillable anytime)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  /**
   * Unique company code, e.g. TNT001.
   * Only uppercase letters and digits, max 20 chars.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'companyCode must be uppercase alphanumeric only (e.g. TNT001)',
  })
  companyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industryType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companySize?: string;

  // Branding
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;

  // Contact
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  // Address
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  // Business Details
  @IsOptional()
  @IsInt({ message: 'establishedYear must be an integer' })
  @Min(1800, { message: 'establishedYear must be 1800 or later' })
  @Max(new Date().getFullYear(), {
    message: `establishedYear cannot be in the future`,
  })
  establishedYear?: number;

  // Flags
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Update ──────────────────────────────────────────────────────────────────

export class UpdateCompanyDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'companyCode must be uppercase alphanumeric only (e.g. TNT001)',
  })
  companyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industryType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  employeeCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companySize?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  // Address
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  // Business Details
  @IsOptional()
  @IsInt({ message: 'establishedYear must be an integer' })
  @Min(1800, { message: 'establishedYear must be 1800 or later' })
  @Max(new Date().getFullYear(), {
    message: `establishedYear cannot be in the future`,
  })
  establishedYear?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export class DeleteCompanyDto {
  @IsNumber()
  id: number;
}
