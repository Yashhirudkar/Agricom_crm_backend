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
import { ShipmentStuffing } from './models/shipment-stuffing.model';

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
      ShipmentStuffing,
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
        CREATE TABLE IF NOT EXISTS shipment_stuffings (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NULL,
          shipment_id INTEGER NOT NULL UNIQUE,
          sales_contract_id INTEGER NULL,
          stuffing_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
          execution_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
          warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
          loading_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
          auto_populated_data JSONB NULL,
          stuffing_date DATE NULL,
          stuffing_start_time VARCHAR(50) NULL,
          stuffing_end_time VARCHAR(50) NULL,
          stuffing_location VARCHAR(255) NULL,
          supervisor VARCHAR(255) NULL,
          operator VARCHAR(255) NULL,
          loading_date DATE NULL,
          loading_start_time VARCHAR(50) NULL,
          loading_end_time VARCHAR(50) NULL,
          actual_loading_weight DECIMAL(12, 2) DEFAULT 0,
          gross_weight DECIMAL(12, 2) DEFAULT 0,
          net_weight DECIMAL(12, 2) DEFAULT 0,
          freight_overrides JSONB NULL,
          containers JSONB DEFAULT '[]'::jsonb,
          trucks JSONB DEFAULT '[]'::jsonb,
          attachments JSONB DEFAULT '[]'::jsonb,
          remarks TEXT NULL,
          completed_at TIMESTAMP WITH TIME ZONE NULL,
          created_by INTEGER NULL,
          updated_by INTEGER NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await this.sequelize.query(`
        ALTER TABLE sales_contract_shipments
        ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) NULL;
        ALTER TABLE shipment_stuffings
        ADD COLUMN IF NOT EXISTS warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS loading_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS operator VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS loading_start_time VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS loading_end_time VARCHAR(50) NULL;
        ALTER TABLE cargo_loading
        ADD COLUMN IF NOT EXISTS warehouse_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS loading_start_time VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS loading_end_time VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS operator VARCHAR(255) NULL;
      `);
      await this.sequelize.query(`
        ALTER TABLE cargo_loading
        ALTER COLUMN truck_no DROP NOT NULL;
      `);
      await this.sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_cargo_loading_pending_shipment
        ON cargo_loading (shipment_id)
        WHERE truck_no IS NULL;
      `);
    } catch (err) {
      console.error('Auto-migration sales_contracts error:', err);
      throw err;
    }
  }
}
