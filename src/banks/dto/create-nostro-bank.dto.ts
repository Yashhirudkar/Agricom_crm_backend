import { IsNotEmpty, IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class CreateNostroBankDto {
  @IsNotEmpty({ message: 'Enterprise Company is required' })
  @IsNumber({}, { message: 'Company ID must be a number' })
  companyId: number;

  @IsNotEmpty({ message: 'Parent Domestic Bank is required' })
  @IsNumber({}, { message: 'Parent Domestic Bank ID must be a number' })
  domesticBankId: number;

  @IsNotEmpty({ message: 'Currency is required' })
  @IsString({ message: 'Currency must be a string' })
  currency: string;

  @IsNotEmpty({ message: 'Nostro Bank Name is required' })
  @IsString({ message: 'Nostro Bank Name must be a string' })
  bankName: string;

  @IsNotEmpty({ message: 'Nostro Account Name is required' })
  @IsString({ message: 'Nostro Account Name must be a string' })
  accountName: string;

  @IsNotEmpty({ message: 'Nostro Account Number is required' })
  @IsString({ message: 'Nostro Account Number must be a string' })
  accountNumber: string;

  @IsNotEmpty({ message: 'Nostro SWIFT Code is required' })
  @IsString({ message: 'Nostro SWIFT Code must be a string' })
  swiftCode: string;

  @IsNotEmpty({ message: 'Nostro Bank Address is required' })
  @IsString({ message: 'Nostro Bank Address must be a string' })
  bankAddress: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], { message: 'Status must be Active or Inactive' })
  status?: 'Active' | 'Inactive';
}
