import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Logistics } from './models/logistics.model';
import { FreightQuote } from './models/freight-quote.model';
import { Enquiry } from '../enquiries/models/enquiry.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { Attachment } from '../attachments/models/attachment.model';

import { Partner } from '../masters/partner/partner.model';
import { PartnerContact } from '../masters/partner/partner-contact.model';

import { LogisticsService } from './services/logistics.service';
import { LogisticsController } from './controllers/logistics.controller';
import { AttachmentsModule } from '../attachments/modules/attachments.module';
import { AuditModule } from '../audit/modules/audit.module';
import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Logistics,
      FreightQuote,
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
  providers: [LogisticsService],
  controllers: [LogisticsController],
  exports: [LogisticsService],
})
export class LogisticsModule {}
