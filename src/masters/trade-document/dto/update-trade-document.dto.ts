import { PartialType } from '@nestjs/swagger';
import { CreateTradeDocumentDto } from './create-trade-document.dto';

export class UpdateTradeDocumentDto extends PartialType(CreateTradeDocumentDto) {}
