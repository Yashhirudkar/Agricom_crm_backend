import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Logistics } from './models/logistics.model';
import { FreightQuote } from './models/freight-quote.model';
import { FreightChargeMaster } from './models/freight-charge-master.model';
import { FreightQuoteCharge } from './models/freight-quote-charge.model';
import { MonthlyStockSummary } from './models/monthly-stock-summary.model';
import { MonthlyStockSummaryCountry } from './models/monthly-stock-summary-country.model';
import { MonthlyStockSection } from './models/monthly-stock-section.model';
import { MonthlyStockSectionColumn } from './models/monthly-stock-section-column.model';
import { MonthlyStockSectionRow } from './models/monthly-stock-section-row.model';
import { MonthlyStockRowCell } from './models/monthly-stock-row-cell.model';

import { Enquiry } from '../enquiries/models/enquiry.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { Attachment } from '../attachments/models/attachment.model';

import { Partner } from '../masters/partner/partner.model';
import { PartnerContact } from '../masters/partner/partner-contact.model';

import { LogisticsService } from './services/logistics.service';
import { LogisticsController } from './controllers/logistics.controller';
import { MonthlyStockSummaryService } from './services/monthly-stock-summary.service';
import { MonthlyStockSummaryController } from './controllers/monthly-stock-summary.controller';
import { AttachmentsModule } from '../attachments/modules/attachments.module';
import { AuditModule } from '../audit/modules/audit.module';
import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Logistics,
      FreightQuote,
      FreightChargeMaster,
      FreightQuoteCharge,
      MonthlyStockSummary,
      MonthlyStockSummaryCountry,
      MonthlyStockSection,
      MonthlyStockSectionColumn,
      MonthlyStockSectionRow,
      MonthlyStockRowCell,
      Enquiry,
      SalesContract,
      SalesContractShipment,
      Attachment,
      Partner,
      PartnerContact,
    ]),
    AttachmentsModule,
    AuditModule,
    RbacModule,
  ],
  providers: [LogisticsService, MonthlyStockSummaryService],
  controllers: [LogisticsController, MonthlyStockSummaryController],
  exports: [LogisticsService, MonthlyStockSummaryService],
})
export class LogisticsModule {}
