import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SysModule } from '../models/SysModule';
import { SubModule } from '../models/SubModule';
import { SystemController } from '../controllers/system.controller';
import { SystemService } from '../services/system.service';
import { SystemSeederService } from '../services/system-seeder.service';
import { RbacModule } from '../../rbac/modules/rbac.module';

@Module({
  imports: [SequelizeModule.forFeature([SysModule, SubModule]), RbacModule],
  controllers: [SystemController],
  providers: [SystemService, SystemSeederService],
  exports: [SystemService],
})
export class SystemModule {}
