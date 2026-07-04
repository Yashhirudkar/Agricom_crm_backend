import { PartialType } from '@nestjs/mapped-types';
import { CreateBagTypeDto } from './create-bag-type.dto';

export class UpdateBagTypeDto extends PartialType(CreateBagTypeDto) {}
