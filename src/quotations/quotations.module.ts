import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Quotation } from './models/quotation.model';
import { QuotationItem } from './models/quotation-item.model';
import { QuotationSequence } from './models/quotation-sequence.model';
import { PartnerFollowUp } from '../masters/partner/partner-followup.model';
import { QuotationNumberService } from './services/quotation-number.service';
import { QuotationService } from './services/quotation.service';
import { QuotationController } from './controllers/quotation.controller';

import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Quotation,
      QuotationItem,
      QuotationSequence,
      PartnerFollowUp,
    ]),
    RbacModule,
  ],
  controllers: [QuotationController],
  providers: [QuotationNumberService, QuotationService],
  exports: [QuotationService, QuotationNumberService],
})
export class QuotationsModule {}


