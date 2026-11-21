import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';

export class UpdateDomesticBankDto {
  @IsOptional()
  @IsNumber({}, { message: 'Company ID must be a number' })
  companyId?: number;

  @IsOptional()
  @IsString({ message: 'Bank Name must be a string' })
  bankName?: string;

  @IsOptional()
  @IsString({ message: 'Currency must be a string' })
  currency?: string;

  @IsOptional()
  @IsString({ message: 'Account Number must be a string' })
  accountNumber?: string;

  @IsOptional()
  @IsString({ message: 'SWIFT Code must be a string' })
  swiftCode?: string;

  @IsOptional()
  @IsString({ message: 'Bank Address must be a string' })
  bankAddress?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], { message: 'Status must be Active or Inactive' })
  status?: 'Active' | 'Inactive';
}
