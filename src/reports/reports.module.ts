import { Module } from '@nestjs/common';
import { SalesReportController } from './sales/sales-report.controller';
import { SalesReportService } from './sales/sales-report.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../sales-contracts/models/sales-contract-item.model';
import { User } from '../users/models/user.model';
import { Partner } from '../masters/partner/partner.model';
import { Product } from '../masters/product/product.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SalesContract,
      SalesContractItem,
      User,
      Partner,
      Product,
    ]),
  ],
  controllers: [SalesReportController],
  providers: [SalesReportService],
  exports: [SalesReportService],
})
export class ReportsModule {}
