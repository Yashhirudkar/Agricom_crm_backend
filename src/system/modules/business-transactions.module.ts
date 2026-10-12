import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BusinessTransaction } from '../models/business-transaction.model';
import { BusinessTransactionCounter } from '../models/business-transaction-counter.model';
import { BusinessTransactionController } from '../controllers/business-transaction.controller';
import { BusinessTransactionService } from '../services/business-transaction.service';
import { RbacModule } from '../../rbac/modules/rbac.module';

@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      BusinessTransaction,
      BusinessTransactionCounter,
    ]),
    RbacModule,
  ],
  controllers: [BusinessTransactionController],
  providers: [BusinessTransactionService],
  exports: [BusinessTransactionService],
})
export class BusinessTransactionsModule {}
