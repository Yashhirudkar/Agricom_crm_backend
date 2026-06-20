import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Product } from './product.model';
import { Category } from '../category/category.model';
import { Country } from '../country/country.model';
import { HSCode } from '../hs-code/hs-code.model';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { buildPagination } from '../common/pagination.helper';
import { buildSearchQuery } from '../common/search.helper';
import { buildPaginatedResponse } from '../common/response.helper';

const INCLUDE_RELATIONS = [
  { model: Category, attributes: ['id', 'name'], where: { isActive: true }, required: false },
  { model: Country, attributes: ['id', 'name', 'iso2Code'], where: { isActive: true }, required: false },
  { model: HSCode, attributes: ['id', 'code', 'description'], where: { isActive: true }, required: false }
];

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
    @InjectModel(HSCode)
    private readonly hsCodeModel: typeof HSCode,
  ) {}

  private async validateForeignKeys(categoryId?: number, countryId?: number, hsCodeId?: number) {
    if (categoryId) {
      const category = await this.categoryModel.findOne({ where: { id: categoryId, isActive: true } });
      if (!category) throw new BadRequestException('Category not found or inactive');
    }
    if (countryId) {
      const country = await this.countryModel.findOne({ where: { id: countryId, isActive: true } });
      if (!country) throw new BadRequestException('Country not found or inactive');
    }
    if (hsCodeId) {
      const hsCode = await this.hsCodeModel.findOne({ where: { id: hsCodeId, isActive: true } });
      if (!hsCode) throw new BadRequestException('HS Code not found or inactive');
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

    await this.validateForeignKeys(dto.categoryId, dto.countryId, dto.hsCodeId);

    return this.productModel.create({
      ...dto,
      name: normalizedName,
    });
  }

  async findAll(query: QueryProductDto) {
    const { search, isActive, categoryId, countryId, hsCodeId, page, limit } = query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {
      ...buildSearchQuery(search, ['name']),
    };
    
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    if (countryId) {
      whereClause.countryId = countryId;
    }
    if (hsCodeId) {
      whereClause.hsCodeId = hsCodeId;
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

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    
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

    if (dto.categoryId || dto.countryId || dto.hsCodeId) {
      await this.validateForeignKeys(dto.categoryId, dto.countryId, dto.hsCodeId);
    }

    await product.update(dto);
    return product.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: number): Promise<Product> {
    const product = await this.findOne(id);
    await product.update({ isActive: false });
    return product.reload({ include: INCLUDE_RELATIONS });
  }
}
