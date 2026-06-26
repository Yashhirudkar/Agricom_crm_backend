import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Category } from './category/category.model';
import { CategoryController } from './category/category.controller';
import { CategoryService } from './category/category.service';
import { Country } from './country/country.model';
import { CountryController } from './country/country.controller';
import { CountryService } from './country/country.service';
import { HSCode } from './hs-code/hs-code.model';
import { HSCodeController } from './hs-code/hs-code.controller';
import { HSCodeService } from './hs-code/hs-code.service';
import { PartnerRole } from './partner-role/partner-role.model';
import { PartnerRoleController } from './partner-role/partner-role.controller';
import { PartnerRoleService } from './partner-role/partner-role.service';
import { Product } from './product/product.model';
import { ProductController } from './product/product.controller';
import { ProductService } from './product/product.service';
import { Partner } from './partner/partner.model';
import { PartnerContact } from './partner/partner-contact.model';
import { PartnerProduct } from './partner/partner-product.model';
import { PartnerController } from './partner/partner.controller';
import { PartnerService } from './partner/partner.service';
import { RbacModule } from '../rbac/modules/rbac.module';
import { DeletionValidatorService } from './deletion-validator.service';
import { AuditModule } from '../audit/modules/audit.module';

// Dynamic Additional Information Engine
import { PartnerRoleDynamicConfig } from './partner-role/partner-role-dynamic-config.model';
import { PartnerDynamicConfigHistory } from './partner-role/partner-dynamic-config-history.model';
import { PartnerDynamicValues } from './partner/partner-dynamic-values.model';
import { PartnerRoleDynamicConfigController } from './partner-role/partner-role-dynamic-config.controller';
import { PartnerRoleDynamicConfigService } from './partner-role/partner-role-dynamic-config.service';
import { PartnerDynamicValuesController } from './partner/partner-dynamic-values.controller';
import { PartnerDynamicValuesService } from './partner/partner-dynamic-values.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Category,
      Country,
      HSCode,
      PartnerRole,
      Product,
      Partner,
      PartnerContact,
      PartnerProduct,
      // Dynamic Additional Information Engine
      PartnerRoleDynamicConfig,
      PartnerDynamicConfigHistory,
      PartnerDynamicValues,
    ]),
    RbacModule,
    AuditModule,
  ],
  controllers: [
    CategoryController,
    CountryController,
    HSCodeController,
    PartnerRoleController,
    ProductController,
    PartnerController,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigController,
    PartnerDynamicValuesController,
  ],
  providers: [
    CategoryService,
    CountryService,
    HSCodeService,
    PartnerRoleService,
    ProductService,
    PartnerService,
    DeletionValidatorService,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigService,
    PartnerDynamicValuesService,
  ],
})
export class MastersModule {}
// Dynamic master tables synced and verified successfully
