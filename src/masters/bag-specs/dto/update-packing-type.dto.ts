import { PartialType } from '@nestjs/mapped-types';
import { CreatePackingTypeDto } from './create-packing-type.dto';

export class UpdatePackingTypeDto extends PartialType(CreatePackingTypeDto) {}
