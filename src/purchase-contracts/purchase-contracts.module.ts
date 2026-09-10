import { Module, forwardRef } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { PurchaseContract } from './models/purchase-contract.model';
import { PurchaseContractItem } from './models/purchase-contract-item.model';
import { PurchaseContractShipment } from './models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from './models/purchase-contract-required-document.model';
import { PurchaseContractActivity } from './models/purchase-contract-activity.model';
import { PurchaseContractAttachment } from './models/purchase-contract-attachment.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { Attachment } from '../attachments/models/attachment.model';

import { PurchaseContractController } from './purchase-contract.controller';
import { PurchaseContractService } from './services/purchase-contract.service';
import { PurchaseContractQueryService } from './services/purchase-contract-query.service';
import { PurchaseContractShipmentService } from './services/purchase-contract-shipment.service';
import { PurchaseContractDocumentService } from './services/purchase-contract-document.service';
import { PurchaseContractActivityService } from './services/purchase-contract-activity.service';

import { RbacModule } from '../rbac/modules/rbac.module';
import { AuditModule } from '../audit/modules/audit.module';
import { AttachmentsModule } from '../attachments/modules/attachments.module';
import { SalesContractsModule } from '../sales-contracts/sales-contracts.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PurchaseContract,
      PurchaseContractItem,
      PurchaseContractShipment,
      PurchaseContractRequiredDocument,
      PurchaseContractActivity,
      PurchaseContractAttachment,
      SalesContract,
      SalesContractShipment,
      TradeDocument,
      Attachment,
    ]),
    RbacModule,
    AuditModule,
    AttachmentsModule,
    // forwardRef to avoid circular dependency with SalesContractsModule
    forwardRef(() => SalesContractsModule),
  ],
  controllers: [PurchaseContractController],
  providers: [
    PurchaseContractService,
    PurchaseContractQueryService,
    PurchaseContractShipmentService,
    PurchaseContractDocumentService,
    PurchaseContractActivityService,
  ],
  exports: [PurchaseContractService],
})
export class PurchaseContractsModule {}
