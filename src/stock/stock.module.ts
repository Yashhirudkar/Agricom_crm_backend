import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockCalculationService } from './services/stock-calculation.service';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../purchase-contracts/models/purchase-contract-shipment.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../sales-contracts/models/sales-contract-item.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { CargoShipmentAllocation } from '../cargo-availability/models/cargo-shipment-allocation.model';
import { CargoAvailability } from '../cargo-availability/models/cargo-availability.model';
import { Product } from '../masters/product/product.model';
import { Country } from '../masters/country/country.model';
import { Port } from '../masters/port/port.model';
import { Partner } from '../masters/partner/partner.model';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import { RbacModule } from '../rbac/modules/rbac.module';
import { ExchangeRateModule } from '../exchange-rates/exchange-rate.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PurchaseContract,
      PurchaseContractItem,
      PurchaseContractShipment,
      SalesContract,
      SalesContractItem,
      SalesContractShipment,
      CargoShipmentAllocation,
      CargoAvailability,
      Product,
      Country,
      Port,
      Partner,
      BusinessTransaction,
    ]),
    RbacModule,
    ExchangeRateModule,
  ],
  controllers: [StockController],
  providers: [StockService, StockCalculationService],
  exports: [StockService, StockCalculationService],
})
export class StockModule {}
