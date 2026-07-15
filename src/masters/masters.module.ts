import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { FinancialYear } from './financial-year/financial-year.model';
import { FinancialYearController } from './financial-year/financial-year.controller';
import { FinancialYearService } from './financial-year/financial-year.service';

import { ShipmentType } from './shipment-type/shipment-type.model';
import { ShipmentTypeController } from './shipment-type/shipment-type.controller';
import { ShipmentTypeService } from './shipment-type/shipment-type.service';
import { PaymentTerm } from './payment-term/payment-term.model';
import { PaymentTermController } from './payment-term/payment-term.controller';
import { PaymentTermService } from './payment-term/payment-term.service';
import { TradeDocument } from './trade-document/trade-document.model';
import { TradeDocumentController } from './trade-document/trade-document.controller';
import { TradeDocumentService } from './trade-document/trade-document.service';
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
import { PartnerFollowUp } from './partner/partner-followup.model';
import { PartnerController } from './partner/partner.controller';
import { PartnerFollowUpController } from './partner/partner-followup.controller';
import { PartnerService } from './partner/partner.service';
import { PartnerFollowUpService } from './partner/partner-followup.service';
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

// Bag Specifications — Dynamic Packaging System
import { BagType } from './bag-specs/models/bag-type.model';
import { PackingType } from './bag-specs/models/packing-type.model';
import { BagSpecification } from './bag-specs/models/bag-specification.model';
import { ProductBagAssignment } from './bag-specs/models/product-bag-assignment.model';
import { BagSpecsController } from './bag-specs/controllers/bag-specs.controller';
import { BagSpecsService } from './bag-specs/services/bag-specs.service';

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
      PartnerFollowUp,
      // Dynamic Additional Information Engine
      PartnerRoleDynamicConfig,
      PartnerDynamicConfigHistory,
      PartnerDynamicValues,
      // Bag Specifications — Dynamic Packaging System
      BagType,
      PackingType,
      BagSpecification,
      ProductBagAssignment,
      FinancialYear,

      ShipmentType,
      PaymentTerm,
      TradeDocument,
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
    PartnerFollowUpController,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigController,
    PartnerDynamicValuesController,
    // Bag Specifications — Dynamic Packaging System
    BagSpecsController,
    FinancialYearController,

    ShipmentTypeController,
    PaymentTermController,
    TradeDocumentController,
  ],
  providers: [
    CategoryService,
    CountryService,
    HSCodeService,
    PartnerRoleService,
    ProductService,
    PartnerService,
    PartnerFollowUpService,
    DeletionValidatorService,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigService,
    PartnerDynamicValuesService,
    // Bag Specifications — Dynamic Packaging System
    BagSpecsService,
    FinancialYearService,

    ShipmentTypeService,
    PaymentTermService,
    TradeDocumentService,
  ],
})
export class MastersModule {}
// Dynamic master tables synced and verified successfully
