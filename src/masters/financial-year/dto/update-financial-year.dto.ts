import { PartialType } from '@nestjs/swagger';
import { CreateFinancialYearDto } from './create-financial-year.dto';

export class UpdateFinancialYearDto extends PartialType(CreateFinancialYearDto) {}
