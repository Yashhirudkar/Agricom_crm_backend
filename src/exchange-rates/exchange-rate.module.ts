import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SequelizeModule } from '@nestjs/sequelize';
import { RbacModule } from '../rbac/modules/rbac.module';
import { Currency } from '../masters/currency/currency.model';
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateCron } from './exchange-rate.cron';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRate } from './models/exchange-rate.model';
import { ExchangeRateRepository } from './repositories/exchange-rate.repository';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    RbacModule,
    SequelizeModule.forFeature([
      ExchangeRate,
      Currency,
      PurchaseContract,
      SalesContract,
    ]),
  ],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateRepository, ExchangeRateService, ExchangeRateCron],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
