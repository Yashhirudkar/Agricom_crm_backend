import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { Company } from '../companies/models/company.model';
import { BanksService } from './banks.service';
import { BanksController } from './banks.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([DomesticBank, NostroBank, Company]),
  ],
  controllers: [BanksController],
  providers: [BanksService],
  exports: [BanksService, SequelizeModule],
})
export class BanksModule {}
