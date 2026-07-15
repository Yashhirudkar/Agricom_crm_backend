import { PartialType } from '@nestjs/swagger';
import { CreateSalesContractDto } from './create-sales-contract.dto';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class UpdateSalesContractDto extends PartialType(CreateSalesContractDto) {}

export enum SalesContractStatus {
  DRAFT = 'Draft',
  ACTIVE = 'Active',
  CANCELLED = 'Cancelled',
  CLOSED = 'Closed',
}

export class UpdateSalesContractStatusDto {
  @IsNotEmpty()
  @IsString()
  @IsEnum(SalesContractStatus)
  status: string;
}
