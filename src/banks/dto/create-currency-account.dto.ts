import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCurrencyAccountDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Company ID must be a number' })
  @Min(1, { message: 'Company ID must be a positive number' })
  companyId?: number;

  @IsNotEmpty({ message: 'Domestic Bank is required' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Domestic Bank ID must be a number' })
  @Min(1, { message: 'Domestic Bank ID must be a positive number' })
  domesticBankId: number;

  @IsNotEmpty({ message: 'Currency is required' })
  @IsString({ message: 'Currency must be a string' })
  @MaxLength(10, { message: 'Currency code cannot exceed 10 characters' })
  currency: string;

  @IsOptional()
  @IsString({ message: 'Account Name must be a string' })
  @MaxLength(255, { message: 'Account Name cannot exceed 255 characters' })
  accountName?: string | null;

  @IsNotEmpty({ message: 'Account Number is required' })
  @IsString({ message: 'Account Number must be a string' })
  @MaxLength(100, { message: 'Account Number cannot exceed 100 characters' })
  accountNumber: string;

  @IsOptional()
  @IsString({ message: 'SWIFT Code must be a string' })
  @MaxLength(50, { message: 'SWIFT Code cannot exceed 50 characters' })
  swiftCode?: string | null;

  @IsOptional()
  @IsString({ message: 'IBAN must be a string' })
  @MaxLength(100, { message: 'IBAN cannot exceed 100 characters' })
  iban?: string | null;

  @IsOptional()
  @IsString({ message: 'Branch Name must be a string' })
  @MaxLength(255, { message: 'Branch Name cannot exceed 255 characters' })
  branchName?: string | null;

  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string | null;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], {
    message: 'Status must be Active or Inactive',
  })
  status?: 'Active' | 'Inactive';

  @IsOptional()
  @IsString({ message: 'Remarks must be a string' })
  remarks?: string | null;
}
