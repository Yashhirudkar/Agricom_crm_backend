import { IsOptional, IsString, IsInt, IsArray, ArrayNotEmpty, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseContractDto {
  @IsInt()
  @Type(() => Number)
  salesContractId: number;



  /**
   * Shipment IDs from sales_contract_shipments to link immediately on creation.
   * At least one shipment ID is expected.
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  shipmentIds?: number[];

  /**
   * Trade document IDs to mark as required for this contract.
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  requiredDocumentTypeIds?: number[];
}
