import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';

export class QueryCurrencyAccountDto {
  @IsOptional()
  @IsNumberString()
  companyId?: string;

  @IsOptional()
  @IsNumberString()
  domesticBankId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
