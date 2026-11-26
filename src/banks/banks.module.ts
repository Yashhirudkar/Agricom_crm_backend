import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { CurrencyAccount } from './models/currency-account.model';
import { Company } from '../companies/models/company.model';
import { BanksService } from './banks.service';
import { BanksController } from './banks.controller';
import { CurrencyAccountsService } from './currency-accounts.service';
import { CurrencyAccountsController } from './currency-accounts.controller';
import { AuditModule } from '../audit/modules/audit.module';
import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      DomesticBank,
      NostroBank,
      CurrencyAccount,
      Company,
    ]),
    AuditModule,
    RbacModule,
  ],
  controllers: [BanksController, CurrencyAccountsController],
  providers: [BanksService, CurrencyAccountsService],
  exports: [BanksService, CurrencyAccountsService, SequelizeModule],
})
export class BanksModule {}
