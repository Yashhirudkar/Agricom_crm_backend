import { Module } from '@nestjs/common';
import { AirportsController } from './airports.controller';
import { AirportsService } from './airports.service';
import { RbacModule } from '../rbac/modules/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [AirportsController],
  providers: [AirportsService],
  exports: [AirportsService],
})
export class LocationsModule {}
