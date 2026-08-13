import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    SequelizeModule.forFeature([
      SalesContract,
      SalesContractItem,
      SalesContractShipment,
      SalesContractDocument,
      SalesContractDocumentFile,
    ]),
    RbacModule,
    AuditModule,
    AttachmentsModule,
  ],
  controllers: [ShipmentController, SalesContractController],
  providers: [SalesContractService, ShipmentService],
})
export class SalesContractsModule {}
