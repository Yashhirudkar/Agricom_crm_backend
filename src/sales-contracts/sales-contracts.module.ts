import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { SequelizeModule, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
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
    forwardRef(() => PurchaseContractsModule),
  ],
  controllers: [ShipmentController, SalesContractController],
  providers: [SalesContractService, ShipmentService],
  exports: [ShipmentService, SalesContractService],
})
export class SalesContractsModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) { }

  async onModuleInit() {
    try {
      await this.sequelize.query(`
        ALTER TABLE sales_contracts
        ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'Export';
      `);
    } catch (err) {
      console.error('Auto-migration sales_contracts error:', err);
    }
  }
}
