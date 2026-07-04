import { PartialType } from '@nestjs/mapped-types';
import { CreateBagSpecDto } from './create-bag-spec.dto';

export class UpdateBagSpecDto extends PartialType(CreateBagSpecDto) {}
