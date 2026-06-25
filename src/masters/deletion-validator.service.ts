import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Product } from './product/product.model';
import { Partner } from './partner/partner.model';
import { PartnerProduct } from './partner/partner-product.model';

@Injectable()
export class DeletionValidatorService {
  constructor(
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(PartnerProduct)
    private readonly partnerProductModel: typeof PartnerProduct,
  ) {}

  async validateCategoryDelete(categoryId: number): Promise<void> {
    const productCount = await this.productModel.count({
      where: { categoryId },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        'Cannot delete category as it is linked to one or more products',
      );
    }
  }

  async validateCountryDelete(countryId: number): Promise<void> {
    const partnerCount = await this.partnerModel.count({
      where: { countryId },
    });
    if (partnerCount > 0) {
      throw new BadRequestException(
        'Cannot delete country as it is linked to one or more partners',
      );
    }
    const productCount = await this.productModel.count({
      where: { countryId },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        'Cannot delete country as it is linked to one or more products',
      );
    }
  }

  async validateHSCodeDelete(hsCodeId: number): Promise<void> {
    const productCount = await this.productModel.count({ where: { hsCodeId } });
    if (productCount > 0) {
      throw new BadRequestException(
        'Cannot delete HS Code as it is linked to one or more products',
      );
    }
  }

  async validatePartnerRoleDelete(partnerRoleId: number): Promise<void> {
    const partnerCount = await this.partnerModel.count({
      where: { partnerRoleId },
    });
    if (partnerCount > 0) {
      throw new BadRequestException(
        'Cannot delete Partner Role as it is linked to one or more partners',
      );
    }
  }

  async validateProductDelete(productId: number): Promise<void> {
    const partnerProductCount = await this.partnerProductModel.count({
      where: { productId },
    });
    if (partnerProductCount > 0) {
      throw new BadRequestException(
        'Cannot delete Product as it is linked to one or more partners',
      );
    }
  }
}
