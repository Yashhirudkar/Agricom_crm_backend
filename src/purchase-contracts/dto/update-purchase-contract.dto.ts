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
  purchaseType?: any;

  @IsOptional()
  sellerContractNo?: any;

  @IsOptional()
  notes?: any;

  @IsOptional()
  terms?: any;

  @IsOptional()
  quantity?: any;

  @IsOptional()
  productQuality?: any;

  @IsOptional()
  packing?: any;

  @IsOptional()
  bagType?: any;

  @IsOptional()
  bagSpec?: any;

  @IsOptional()
  stitching?: any;

  @IsOptional()
  marking?: any;

  @IsOptional()
  incoterm?: any;

  @IsOptional()
  deliveryPlace?: any;

  @IsOptional()
  status?: any;

  @IsOptional()
  shipmentIds?: any;

  @IsOptional()
  shipmentScheduleData?: any;
}

export class UpdatePurchaseContractStatusDto {
  @IsIn(VALID_PC_STATUSES)
  status: PurchaseContractStatus;
}
