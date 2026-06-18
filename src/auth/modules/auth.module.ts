import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersModule } from '../../users/modules/users.module';
import { ClientsModule } from '../../clients/modules/clients.module';
import { ProfileModule } from '../../profile/profile.module';
import { SystemModule } from '../../system/modules/system.module';
import { AuthService } from '../services/auth.service';
import { AuthController } from '../controllers/auth.controller';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { UserSession } from '../../users/models/user-session.model';
import { UserCompany } from '../../users/models/user-company.model';
import { SessionCleanupService } from '../services/session-cleanup.service';

@Module({
  imports: [
    UsersModule,
    ClientsModule,
    ProfileModule,
    SystemModule,
    SequelizeModule.forFeature([UserSession, UserCompany]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES') || '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
