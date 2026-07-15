import { PartialType } from '@nestjs/swagger';
import { CreateShipmentTypeDto } from './create-shipment-type.dto';

export class UpdateShipmentTypeDto extends PartialType(CreateShipmentTypeDto) {}
