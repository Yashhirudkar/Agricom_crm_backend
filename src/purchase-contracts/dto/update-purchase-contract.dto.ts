import { IsOptional, IsString, IsIn, IsArray, IsNumber } from 'class-validator';

export const VALID_PC_STATUSES = [
  'Draft',
  'In Progress',
  'Awaiting Documents',
  'Ready for Dispatch',
  'Completed',
  'Closed',
  'Cancelled',
] as const;

export type PurchaseContractStatus = (typeof VALID_PC_STATUSES)[number];

export class UpdatePurchaseContractDto {


  @IsOptional()
  @IsString()
  sellerContractNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  shipmentIds?: number[];
}

export class UpdatePurchaseContractStatusDto {
  @IsIn(VALID_PC_STATUSES)
  status: PurchaseContractStatus;
}
