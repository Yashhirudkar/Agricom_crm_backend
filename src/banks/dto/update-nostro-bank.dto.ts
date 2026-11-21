import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';

export class UpdateNostroBankDto {
  @IsOptional()
  @IsNumber({}, { message: 'Company ID must be a number' })
  companyId?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Parent Domestic Bank ID must be a number' })
  domesticBankId?: number;

  @IsOptional()
  @IsString({ message: 'Currency must be a string' })
  currency?: string;

  @IsOptional()
  @IsString({ message: 'Nostro Bank Name must be a string' })
  bankName?: string;

  @IsOptional()
  @IsString({ message: 'Nostro Account Name must be a string' })
  accountName?: string;

  @IsOptional()
  @IsString({ message: 'Nostro Account Number must be a string' })
  accountNumber?: string;

  @IsOptional()
  @IsString({ message: 'Nostro SWIFT Code must be a string' })
  swiftCode?: string;

  @IsOptional()
  @IsString({ message: 'Nostro Bank Address must be a string' })
  bankAddress?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], { message: 'Status must be Active or Inactive' })
  status?: 'Active' | 'Inactive';
}
