import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
  ValidateNested,
  IsArray,
  IsBoolean,
  Matches,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalesContractItemDto {
  @IsNotEmpty()
  @IsInt()
  productId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  unitPrice: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @IsInt()
  bagTypeId: number;

  @IsNotEmpty()
  @IsInt()
  packingTypeId: number;

  @IsOptional()
  @IsInt()
  bagSpecificationId?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateSalesContractShipmentDto {
  @IsNotEmpty()
  @IsDateString()
  shipmentDate: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateSalesContractDocumentDto {
  @IsNotEmpty()
  @IsInt()
  tradeDocumentId: number;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateSalesContractDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { message: 'financialYear must be in YYYY-YYYY format' })
  financialYear: string;

  @IsNotEmpty()
  @IsString()
  contractNumber: string;

  @IsNotEmpty()
  @IsDateString()
  contractDate: string;

  @IsNotEmpty()
  @IsInt()
  buyerId: number;

  @IsOptional()
  @IsInt()
  sellerId?: number;

  @IsOptional()
  @IsInt()
  brokerId?: number;

  @IsNotEmpty()
  @IsString()
  currencyCode: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  totalQuantity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsNotEmpty()
  @IsInt()
  shipmentTypeId: number;

  @IsNotEmpty()
  @IsInt()
  paymentTermId: number;

  @IsNotEmpty()
  @IsString()
  originCountry: string;

  @IsNotEmpty()
  @IsString()
  destinationCountry: string;

  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  // Multi-Modal Transport Routing
  @IsOptional()
  @IsString()
  originTransportMode?: string;

  @IsOptional()
  @IsString()
  destinationTransportMode?: string;

  @IsOptional()
  @IsString()
  originLocationName?: string;

  @IsOptional()
  @IsString()
  destinationLocationName?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  terms?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otherConditions?: string[];

  @IsOptional()
  disputeResolution?: any;

  @IsOptional()
  forceMajeure?: any;

  // Contract Acceptance
  @IsOptional()
  @IsString()
  sellerCompanyName?: string;

  @IsOptional()
  @IsString()
  sellerAuthorizedSignatory?: string;

  @IsOptional()
  @IsString()
  sellerSignature?: string;

  @IsOptional()
  @IsString()
  sellerCompanySeal?: string;

  @IsOptional()
  @IsString()
  buyerCompanyName?: string;

  @IsOptional()
  @IsString()
  buyerAuthorizedSignatory?: string;

  @IsOptional()
  @IsString()
  buyerSignature?: string;

  @IsOptional()
  @IsString()
  buyerCompanySeal?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsObject()
  printOverrides?: any;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesContractItemDto)
  items: CreateSalesContractItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesContractShipmentDto)
  shipments: CreateSalesContractShipmentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesContractDocumentDto)
  documents: CreateSalesContractDocumentDto[];
}
