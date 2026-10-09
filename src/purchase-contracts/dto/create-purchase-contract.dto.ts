import {
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseContractItemDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  productId?: number;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  quantity?: number | string;

  @IsOptional()
  @IsString()
  productQuality?: string;

  @IsOptional()
  @IsString()
  packing?: string;

  @IsOptional()
  @IsString()
  bagType?: string;

  @IsOptional()
  @IsString()
  bagSpec?: string;

  @IsOptional()
  @IsString()
  stitching?: string;

  @IsOptional()
  @IsString()
  marking?: string;

  @IsOptional()
  ratePerMt?: number | string;

  @IsOptional()
  totalAmount?: number | string;
}

export class ShipmentAllocationDto {
  @IsInt()
  @Type(() => Number)
  shipmentId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  purchaseContractItemId?: number;

  @IsOptional()
  allocatedQuantity?: number | string;
}

export class CreatePurchaseContractDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salesContractId?: number;

  @IsOptional()
  @IsString()
  purchaseType?: 'SC' | 'MTT';

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  buyerId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sellerId?: number;

  @IsOptional()
  @IsString()
  sellerContractNo?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  specificationNo?: string;

  @IsOptional()
  @IsString()
  specificationDate?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  paymentTermId?: number;

  @IsOptional()
  @IsString()
  paymentTermsText?: string;

  @IsOptional()
  advancePercent?: number | string;

  @IsOptional()
  balancePercent?: number | string;

  @IsOptional()
  penaltyPercent?: number | string;

  @IsOptional()
  @IsString()
  paymentDueDate?: string;

  @IsOptional()
  @IsString()
  unloadingDate?: string;

  @IsOptional()
  @IsString()
  deliveryPlace?: string;

  @IsOptional()
  @IsString()
  placeOfLoading?: string;

  @IsOptional()
  @IsString()
  dispatchDate?: string;

  @IsOptional()
  @IsString()
  dispatchToDate?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  brokerId?: number;

  @IsOptional()
  @IsString()
  brokerCommission?: string;

  @IsOptional()
  quantity?: number | string;

  @IsOptional()
  @IsString()
  productQuality?: string;

  @IsOptional()
  @IsString()
  packing?: string;

  @IsOptional()
  @IsString()
  bagType?: string;

  @IsOptional()
  @IsString()
  bagSpec?: string;

  @IsOptional()
  @IsString()
  stitching?: string;

  @IsOptional()
  @IsString()
  marking?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  terms?: string[];

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseContractItemDto)
  items?: CreatePurchaseContractItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipmentAllocationDto)
  shipmentAllocations?: ShipmentAllocationDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  shipmentIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  requiredDocumentTypeIds?: number[];
}
