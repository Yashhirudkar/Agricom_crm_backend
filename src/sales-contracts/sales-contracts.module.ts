import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SalesContract } from './models/sales-contract.model';
import { SalesContractItem } from './models/sales-contract-item.model';
import { SalesContractShipment } from './models/sales-contract-shipment.model';
import { SalesContractDocument } from './models/sales-contract-document.model';
import { SalesContractController } from './sales-contract.controller';
import { SalesContractService } from './sales-contract.service';
import { ShipmentController } from './shipment.controller';
import { ShipmentService } from './shipment.service';
import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';
import { SalesContractDocumentFile } from './models/sales-contract-document-file.model';
import { AttachmentsModule } from '../attachments/modules/attachments.module';
import { PurchaseContractsModule } from '../purchase-contracts/purchase-contracts.module';
import { Logistics } from '../logistics/models/logistics.model';
import { FreightQuote } from '../logistics/models/freight-quote.model';
import { ShipmentReadinessService } from './services/shipment-readiness.service';
import { ShipmentStuffing } from './models/shipment-stuffing.model';
import { TransportDetail } from '../enquiries/models/transport-detail.model';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockModule } from '../stock/stock.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { Attachment } from '../attachments/models/attachment.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SalesContract,
      SalesContractItem,
      SalesContractShipment,
      SalesContractDocument,
      SalesContractDocumentFile,
      Logistics,
      FreightQuote,
      ShipmentStuffing,
      Attachment,
      TransportDetail,
    ]),
    RbacModule,
    AuditModule,
    AttachmentsModule,
    forwardRef(() => PurchaseContractsModule),
    forwardRef(() => LogisticsModule),
    NotificationsModule,
    StockModule,
  ],
  controllers: [ShipmentController, SalesContractController],
  providers: [SalesContractService, ShipmentService, ShipmentReadinessService],
  exports: [ShipmentService, SalesContractService, ShipmentReadinessService],
})
export class SalesContractsModule {}
