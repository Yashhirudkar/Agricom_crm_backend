import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const toNumber = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined ? 0 : Number(value);

export class ExportGoodsItemDto {
  @IsOptional()
  id?: string | number;

  @IsString()
  @IsOptional()
  marksAndNos: string;

  @IsString()
  @IsOptional()
  containerNo: string;

  @IsString()
  @IsOptional()
  noAndKindOfPackages: string;

  @IsString()
  @IsOptional()
  descriptionOfGoods: string;

  @IsNumber()
  @IsOptional()
  @Transform(toNumber)
  quantity: number;

  @IsString()
  @IsOptional()
  quantityUnit?: string;

  @IsNumber()
  @IsOptional()
  @Transform(toNumber)
  rate: number;

  @IsNumber()
  @IsOptional()
  @Transform(toNumber)
  amount: number;
}

export class CreateExportInvoiceDto {
  @IsOptional()
  @IsNumber()
  companyId?: number;

  @IsOptional()
  @IsNumber()
  salesContractId?: number;

  @IsOptional()
  @IsNumber()
  shipmentId?: number;

  @IsOptional()
  @IsNumber()
  purchaseContractId?: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsNumber()
  sequenceNumber?: number;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  exporterRef?: string;

  @IsOptional()
  @IsString()
  sellerOrderNo?: string;

  @IsOptional()
  @IsDateString()
  sellerOrderDate?: string;

  @IsOptional()
  @IsString()
  otherRef?: string;

  @IsOptional()
  @IsString()
  buyerOrderNo?: string;

  @IsOptional()
  @IsDateString()
  buyerOrderDate?: string;

  @IsOptional()
  sellerDetails?: any;

  @IsOptional()
  consigneeDetails?: any;

  @IsOptional()
  notifyPartyDetails?: any;

  @IsOptional()
  buyerOtherThanConsignee?: any;

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  countryOfFinalDestination?: string;

  @IsOptional()
  @IsString()
  termsOfDeliveryPayment?: string;

  @IsOptional()
  @IsString()
  carriageBy?: string;

  @IsOptional()
  @IsString()
  placeOfReceiptByPreCarrier?: string;

  @IsOptional()
  @IsString()
  placeOfLoading?: string;

  @IsOptional()
  @IsString()
  placeOfUnloading?: string;

  @IsOptional()
  @IsString()
  finalDestination?: string;

  @IsOptional()
  @IsArray()
  truckNumbers?: string[];

  @IsOptional()
  @IsArray()
  containerNumbers?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExportGoodsItemDto)
  goodsItems?: ExportGoodsItemDto[];

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  totalQuantity?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  amountChargeable?: number;

  @IsOptional()
  @IsString()
  amountInWords?: string;

  @IsOptional()
  @IsString()
  bankKey?: string;

  @IsOptional()
  bankDetails?: any;

  @IsOptional()
  @IsString()
  declaration?: string;

  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  stampUrl?: string;

  @IsOptional()
  @IsString()
  signatoryName?: string;

  @IsOptional()
  @IsString()
  signatoryDesignation?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  metadata?: any;
}

