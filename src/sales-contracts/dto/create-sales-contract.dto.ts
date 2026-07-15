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
  @IsInt()
  financialYearId: number;

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
  @IsInt()
  originCountryId: number;

  @IsNotEmpty()
  @IsInt()
  destinationCountryId: number;

  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  status?: string;

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
