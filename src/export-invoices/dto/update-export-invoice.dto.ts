import { PartialType } from '@nestjs/swagger';
import { CreateExportInvoiceDto } from './create-export-invoice.dto';

export class UpdateExportInvoiceDto extends PartialType(CreateExportInvoiceDto) {}

