import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { Currency } from './currency/currency.model';
import { CurrencyController } from './currency/currency.controller';
import { CurrencyService } from './currency/currency.service';

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
import { PartnerDnbReport } from './partner/partner-dnb-report.model';
import { PartnerController } from './partner/partner.controller';
import { PartnerFollowUpController } from './partner/partner-followup.controller';
import { PartnerDnbReportController } from './partner/partner-dnb-report.controller';
import { PartnerService } from './partner/partner.service';
import { PartnerFollowUpService } from './partner/partner-followup.service';
import { PartnerDnbReportService } from './partner/partner-dnb-report.service';
import { RbacModule } from '../rbac/modules/rbac.module';
import { DeletionValidatorService } from './deletion-validator.service';
import { AuditModule } from '../audit/modules/audit.module';
import { FollowUpManagementModule } from '../follow-up-management/follow-up-management.module';
import { User } from '../users/models/user.model';

// Dynamic Additional Information Engine
import { PartnerRoleDynamicConfig } from './partner-role/partner-role-dynamic-config.model';
import { PartnerDynamicConfigHistory } from './partner-role/partner-dynamic-config-history.model';
import { PartnerDynamicValues } from './partner/partner-dynamic-values.model';
import { RolePartnerRoleAccess } from './partner-role/role-partner-role-access.model';
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

import { EquipmentOption } from './equipment-option/equipment-option.model';
import { EquipmentOptionController } from './equipment-option/equipment-option.controller';
import { EquipmentOptionService } from './equipment-option/equipment-option.service';

// Port & Shipping Line Masters
import { Country } from './country/country.model';
import { CountryController } from './country/country.controller';
import { CountryService } from './country/country.service';
import { Port, PortShippingLine } from './port/port.model';
import { PortController } from './port/port.controller';
import { PortService } from './port/port.service';
import { ShippingLine } from './shipping-line/shipping-line.model';
import { ShippingLineController } from './shipping-line/shipping-line.controller';
import { ShippingLineService } from './shipping-line/shipping-line.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Category,
      Currency,
      PartnerRole,
      Product,
      Partner,
      PartnerContact,
      PartnerProduct,
      PartnerFollowUp,
      PartnerDnbReport,
      User,
      // Dynamic Additional Information Engine
      PartnerRoleDynamicConfig,
      PartnerDynamicConfigHistory,
      PartnerDynamicValues,
      RolePartnerRoleAccess,
      // Bag Specifications — Dynamic Packaging System
      BagType,
      PackingType,
      BagSpecification,
      ProductBagAssignment,

      ShipmentType,
      PaymentTerm,
      TradeDocument,
      EquipmentOption,

      // Port & Shipping Line Masters
      Country,
      Port,
      ShippingLine,
      PortShippingLine,
    ]),
    RbacModule,
    AuditModule,
    FollowUpManagementModule,
  ],
  controllers: [
    CategoryController,
    CurrencyController,
    PartnerRoleController,
    ProductController,
    PartnerController,
    PartnerFollowUpController,
    PartnerDnbReportController,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigController,
    PartnerDynamicValuesController,
    // Bag Specifications — Dynamic Packaging System
    BagSpecsController,

    ShipmentTypeController,
    PaymentTermController,
    TradeDocumentController,
    EquipmentOptionController,

    // Port & Shipping Line Masters
    CountryController,
    PortController,
    ShippingLineController,
  ],
  providers: [
    CategoryService,
    CurrencyService,
    PartnerRoleService,
    ProductService,
    PartnerService,
    PartnerFollowUpService,
    PartnerDnbReportService,
    DeletionValidatorService,
    // Dynamic Additional Information Engine
    PartnerRoleDynamicConfigService,
    PartnerDynamicValuesService,
    // Bag Specifications — Dynamic Packaging System
    BagSpecsService,

    ShipmentTypeService,
    PaymentTermService,
    TradeDocumentService,
    EquipmentOptionService,

    // Port & Shipping Line Masters
    CountryService,
    PortService,
    ShippingLineService,
  ],
  exports: [
    CountryService,
    PortService,
    ShippingLineService,
  ],
})
export class MastersModule {}
// Dynamic master tables synced and verified successfully
