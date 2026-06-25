import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Holiday } from './models/holiday.model';
import { HolidayCompany } from './models/holiday-company.model';
import { HolidaysController } from './controllers/holidays.controller';
import { HolidaysService } from './services/holidays.service';
import { AuditModule } from '../audit/modules/audit.module';
import { RbacModule } from '../rbac/modules/rbac.module';
import { UserCompany } from '../users/models/user-company.model';
import { UserRole } from '../rbac/models/user-role.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Holiday,
      HolidayCompany,
      UserCompany,
      UserRole,
    ]),
    AuditModule,
    RbacModule,
  ],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
