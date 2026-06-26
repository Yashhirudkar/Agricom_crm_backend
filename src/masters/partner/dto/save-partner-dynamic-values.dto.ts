import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SavePartnerDynamicValuesDto {
  /**
   * The ID of the dynamic config this submission is against.
   * Must be the active config for the partner's current role.
   * Used to pin the values to the exact schema version.
   */
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  configId: number;

  /**
   * Flat JSONB object of field key → submitted value pairs.
   *
   * Example (Buyer with Port + Road selected):
   * {
   *   "delivery_mode": ["Port", "Road"],
   *   "port_address": "JNPT Mumbai Gate 4",
   *   "port_custom_clearance_address": "CHA Office, Nhava Sheva",
   *   "road_address": "NH-48 Delhi Ring Road",
   *   "road_custom_clearance_address": "ICD Tughlakabad, Delhi"
   * }
   *
   * Example (Warehouse):
   * {
   *   "warehouse_type": ["Storage", "Cleaning"]
   * }
   */
  @IsObject()
  @IsNotEmpty()
  valuesJson: Record<string, any>;
}
