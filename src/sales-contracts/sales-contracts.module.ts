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
import { CargoShipmentAllocation } from '../cargo-availability/models/cargo-shipment-allocation.model';
import { CargoLoading } from '../cargo-availability/models/cargo-loading.model';
import { Logistics } from '../logistics/models/logistics.model';
import { FreightQuote } from '../logistics/models/freight-quote.model';
import { ShipmentReadinessService } from './services/shipment-readiness.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SalesContract,
      SalesContractItem,
      SalesContractShipment,
      SalesContractDocument,
      SalesContractDocumentFile,
      CargoShipmentAllocation,
      CargoLoading,
      Logistics,
      FreightQuote,
    ]),
    RbacModule,
    AuditModule,
    AttachmentsModule,
    forwardRef(() => PurchaseContractsModule),
  ],
  controllers: [ShipmentController, SalesContractController],
  providers: [SalesContractService, ShipmentService, ShipmentReadinessService],
  exports: [ShipmentService, SalesContractService, ShipmentReadinessService],
})
export class SalesContractsModule implements OnModuleInit {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    try {
      await this.sequelize.query(`
        ALTER TABLE sales_contracts
        ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50) DEFAULT 'Export';
      `);
      await this.sequelize.query(`
        ALTER TABLE sales_contract_shipments
        ADD COLUMN IF NOT EXISTS manual_ready_override BOOLEAN NULL,
        ADD COLUMN IF NOT EXISTS manual_ready_by INTEGER NULL,
        ADD COLUMN IF NOT EXISTS manual_ready_at TIMESTAMP WITH TIME ZONE NULL,
        ADD COLUMN IF NOT EXISTS manual_ready_reason TEXT NULL;
      `);
      await this.sequelize.query(`
        UPDATE sales_contract_shipments
        SET status = 'Executed'
        WHERE (
          id IN (SELECT shipment_id FROM purchase_contract_shipments)
          OR shipment_reference ILIKE '%00125/2%'
        )
        AND status != 'Executed';
      `);
    } catch (err) {
      console.error('Auto-migration sales_contracts error:', err);
    }
  }
}
