import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProfileController } from './controllers/profile.controller';
import { ProfileService } from './services/profile.service';
import { User } from '../users/models/user.model';
import { Employee } from '../hrms/models/employee.model';
import { UserPreference } from '../users/models/user-preference.model';
import { ProfileActivityLog } from './models/profile-activity-log.model';
import { UserPasswordHistory } from '../users/models/user-password-history.model';
import { EmployeeDocument } from '../hrms/models/employee-document.model';
import { EmployeeLeaveBalance } from '../hrms/models/employee-leave-balance.model';
import { UserSession } from '../users/models/user-session.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      Employee,
      UserPreference,
      ProfileActivityLog,
      UserPasswordHistory,
      EmployeeDocument,
      EmployeeLeaveBalance,
      UserSession,
    ]),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
