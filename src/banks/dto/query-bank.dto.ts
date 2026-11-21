import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class QueryDomesticBankDto {
  @IsOptional()
  @IsNumberString()
  companyId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class QueryNostroBankDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
