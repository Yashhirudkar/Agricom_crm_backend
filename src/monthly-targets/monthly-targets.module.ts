import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { MonthlyTarget } from './models/monthly-target.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { UserCompany } from '../users/models/user-company.model';
import { UserRole } from '../rbac/models/user-role.model';
import { Role } from '../rbac/models/role.model';
import { MonthlyTargetsService } from './monthly-targets.service';
import { MonthlyTargetsController } from './monthly-targets.controller';
import { SalesOnlyGuard } from './guards/sales-only.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MonthlyTarget,
      SalesContract,
      UserCompany,
      UserRole,
      Role,
    ]),
    NotificationsModule,
  ],
  controllers: [MonthlyTargetsController],
  providers: [MonthlyTargetsService, SalesOnlyGuard],
  exports: [MonthlyTargetsService],
})
export class MonthlyTargetsModule {}

