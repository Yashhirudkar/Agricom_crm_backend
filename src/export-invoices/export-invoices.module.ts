import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ExportInvoice } from './models/export-invoice.model';
import { ExportInvoiceSequence } from './models/export-invoice-sequence.model';
import { ExportInvoicesController } from './export-invoices.controller';
import { ExportInvoicesService } from './services/export-invoices.service';
import { BankDetailsProviderService } from './services/bank-details-provider.service';
import { InvoiceNumberService } from './services/invoice-number.service';
import { SignatureProviderService } from './services/signature-provider.service';

import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { ShipmentStuffing } from '../sales-contracts/models/shipment-stuffing.model';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractShipment } from '../purchase-contracts/models/purchase-contract-shipment.model';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      ExportInvoice,
      ExportInvoiceSequence,
      SalesContractShipment,
      SalesContract,
      ShipmentStuffing,
      PurchaseContract,
      PurchaseContractShipment,
      BusinessTransaction,
    ]),
    RbacModule,
  ],
  controllers: [ExportInvoicesController],
  providers: [
    ExportInvoicesService,
    BankDetailsProviderService,
    InvoiceNumberService,
    SignatureProviderService,
  ],
  exports: [
    ExportInvoicesService,
    BankDetailsProviderService,
    InvoiceNumberService,
    SignatureProviderService,
  ],
})
export class ExportInvoicesModule {}

