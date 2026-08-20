import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Product } from './product.model';
import { Category } from '../category/category.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { buildPagination } from '../common/pagination.helper';
import { buildSearchQuery } from '../common/search.helper';
import { buildPaginatedResponse } from '../common/response.helper';
import { DeletionValidatorService } from '../deletion-validator.service';
import { AuditService } from '../../audit/services/audit.service';

const INCLUDE_RELATIONS = [
  {
    model: Category,
    attributes: ['id', 'name'],
    where: { isActive: true },
    required: false,
  },
];

@Injectable()
export class ProductService implements OnModuleInit {
  constructor(
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    private readonly deletionValidator: DeletionValidatorService,
    private readonly auditService: AuditService,
    private readonly sequelize: Sequelize,
  ) {}

  async onModuleInit() {
    // Schema modifications are handled by database migrations (phase-04-masters)
  }

  private async validateForeignKeys(categoryId?: number) {
    if (categoryId) {
      const category = await this.categoryModel.findOne({
        where: { id: categoryId, isActive: true },
      });
      if (!category)
        throw new BadRequestException('Category not found or inactive');
    }
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const normalizedName = dto.name.trim().toUpperCase();

    if (dto.qualitySubType) {
      dto.qualitySubType = dto.qualitySubType.trim();
    }
    if (dto.specification) {
      dto.specification = dto.specification.trim();
    }
    if (dto.hsCode) {
      dto.hsCode = dto.hsCode.trim();
    }

    await this.validateForeignKeys(dto.categoryId);

    return this.productModel.create({
      ...dto,
      name: normalizedName,
    });
  }

  async findAll(query: QueryProductDto) {
    const { search, isActive, categoryId, country, hsCode, page, limit } =
      query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {
      ...buildSearchQuery(search, ['name', 'hsCode']),
    };

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    if (country) {
      const cTrim = country.trim();
      const cLower = cTrim.toLowerCase();
      if (cLower === 'china' || cLower.includes('people') || cLower.includes('republic of china') || cLower === 'cn' || cLower === 'chn') {
        whereClause[Op.or] = [
          { country: { [Op.iLike]: '%China%' } },
          { country: { [Op.iLike]: '%People%Republic of China%' } },
        ];
      } else {
        whereClause.country = { [Op.iLike]: `%${cTrim}%` };
      }
    }
    if (hsCode) {
      whereClause.hsCode = { [Op.iLike]: `%${hsCode}%` };
    }

    const { rows, count } = await this.productModel.findAndCountAll({
      where: whereClause,
      limit: finalLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: INCLUDE_RELATIONS,
    });

    return buildPaginatedResponse(rows, count, page || 1, finalLimit);
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productModel.findOne({
      where: { id, isActive: true },
      include: INCLUDE_RELATIONS,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findOneActive(id: number): Promise<Product> {
    return this.findOne(id);
  }

  async findOneAnyState(id: number): Promise<Product> {
    const product = await this.productModel.findOne({
      where: { id },
      include: INCLUDE_RELATIONS,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOneActive(id);

    if (dto.name) {
      const normalizedName = dto.name.trim().toUpperCase();
      dto.name = normalizedName;
    }
    if (dto.qualitySubType) {
      dto.qualitySubType = dto.qualitySubType.trim();
    }
    if (dto.specification) {
      dto.specification = dto.specification.trim();
    }
    if (dto.hsCode !== undefined) {
      dto.hsCode = dto.hsCode ? dto.hsCode.trim() : null;
    }

    if (dto.categoryId) {
      await this.validateForeignKeys(dto.categoryId);
    }

    await product.update(dto);
    return product.reload({ include: INCLUDE_RELATIONS });
  }

  async restore(id: number, user: any): Promise<Product> {
    const product = await this.findOneAnyState(id);
    const oldIsActive = product.isActive;
    await product.update({ isActive: true });

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'Product',
      entityId: product.id,
      action: 'RESTORE',
      oldValue: { isActive: oldIsActive },
      newValue: { isActive: true },
    });

    return product.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: number, reason?: string, user?: any): Promise<Product> {
    const product = await this.findOneActive(id);
    await product.update({ isActive: false });

    if (user) {
      await this.auditService.writeLog({
        clientId: user.clientId || null,
        companyId: user.companyId || null,
        userId: user.userId,
        entityType: 'Product',
        entityId: id,
        action: 'DELETE',
        oldValue: {
          isActive: true,
          deletedAt: new Date(),
          deletedBy: user.userId,
          deleteReason: reason || 'Deactivated',
        },
        newValue: { isActive: false },
      });
    }

    return product.reload({ include: INCLUDE_RELATIONS });
  }

  async removePermanent(id: number, reason: string, user: any): Promise<void> {
    const product = await this.findOneAnyState(id);
    await this.deletionValidator.validateProductDelete(id);

    const oldValue = {
      ...product.toJSON(),
      deletedAt: new Date(),
      deletedBy: user.userId,
      deleteReason: reason || 'No reason provided',
    };

    await product.destroy();

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'Product',
      entityId: id,
      action: 'FORCE_DELETE',
      oldValue,
      newValue: null,
    });
  }
}
