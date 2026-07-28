import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { EnquiriesService } from './enquiries.service';
import { EnquiriesController } from './enquiries.controller';
import { Enquiry } from './models/enquiry.model';
import { MastersModule } from '../masters/masters.module';
import { AuditModule } from '../audit/modules/audit.module';
import { RbacModule } from '../rbac/modules/rbac.module';
import { AuthModule } from '../auth/modules/auth.module';
import { PartnerRole } from '../masters/partner-role/partner-role.model';
import { Partner } from '../masters/partner/partner.model';
import { Product } from '../masters/product/product.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Enquiry,
      PartnerRole,
      Partner,
      Product,
      PackingType,
    ]),
    MastersModule,
    AuditModule,
    RbacModule,
    AuthModule,
  ],
  controllers: [EnquiriesController],
  providers: [EnquiriesService],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
