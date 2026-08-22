import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for adding a shipment reference to a Purchase Contract.
 * No financial fields — all data lives in SalesContractShipment.
 */
export class AddShipmentDto {
  @IsInt()
  @Type(() => Number)
  shipmentId: number;
}
