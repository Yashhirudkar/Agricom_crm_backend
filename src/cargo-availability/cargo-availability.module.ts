import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CargoAvailability } from './models/cargo-availability.model';
import { CargoReadiness } from './models/cargo-readiness.model';
import { CargoShipmentAllocation } from './models/cargo-shipment-allocation.model';
import { CargoLoading } from './models/cargo-loading.model';
import { CargoDocument } from './models/cargo-document.model';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { SalesContractShipment } from '../sales-contracts/models/sales-contract-shipment.model';
import { CargoAvailabilityService } from './cargo-availability.service';
import { CargoAvailabilityController } from './cargo-availability.controller';

import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      CargoAvailability,
      CargoReadiness,
      CargoShipmentAllocation,
      CargoLoading,
      CargoDocument,
      PurchaseContract,
      PurchaseContractItem,
      SalesContractShipment,
    ]),
    RbacModule,
  ],
  controllers: [CargoAvailabilityController],
  providers: [CargoAvailabilityService],
  exports: [CargoAvailabilityService],
})
export class CargoAvailabilityModule {}
