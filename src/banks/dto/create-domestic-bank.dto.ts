import { IsNotEmpty, IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class CreateDomesticBankDto {
  @IsNotEmpty({ message: 'Enterprise Company is required' })
  @IsNumber({}, { message: 'Company ID must be a number' })
  companyId: number;

  @IsNotEmpty({ message: 'Bank Name is required' })
  @IsString({ message: 'Bank Name must be a string' })
  bankName: string;

  @IsNotEmpty({ message: 'Currency is required' })
  @IsString({ message: 'Currency must be a string' })
  currency: string;

  @IsNotEmpty({ message: 'Account Number is required' })
  @IsString({ message: 'Account Number must be a string' })
  accountNumber: string;

  @IsNotEmpty({ message: 'SWIFT Code is required' })
  @IsString({ message: 'SWIFT Code must be a string' })
  swiftCode: string;

  @IsNotEmpty({ message: 'Bank Address is required' })
  @IsString({ message: 'Bank Address must be a string' })
  bankAddress: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'], { message: 'Status must be Active or Inactive' })
  status?: 'Active' | 'Inactive';
}
