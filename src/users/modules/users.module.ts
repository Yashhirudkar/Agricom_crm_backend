import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../models/user.model';
import { UserSession } from '../models/user-session.model';
import { UsersService } from '../services/users.service';
import { UsersController } from '../controllers/users.controller';
import { Role } from '../../rbac/models/role.model';
import { UserRole } from '../../rbac/models/user-role.model';
import { Company } from '../../companies/models/company.model';
import { Client } from '../../clients/models/client.model';
import { RbacModule } from '../../rbac/modules/rbac.module';
import { UserCompany } from '../models/user-company.model';
import { UserInvitation } from '../models/user-invitation.model';
import { UserInvitationService } from '../services/user-invitation.service';
import { UserInvitationController } from '../controllers/user-invitation.controller';
import { AuditModule } from '../../audit/modules/audit.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      UserSession,
      Role,
      UserRole,
      Company,
      Client,
      UserCompany,
      UserInvitation,
    ]),
    RbacModule,
    AuditModule,
  ],
  providers: [UsersService, UserInvitationService],
  controllers: [UsersController, UserInvitationController],
  exports: [UsersService, UserInvitationService],
})
export class UsersModule { }
