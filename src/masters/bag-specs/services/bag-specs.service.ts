import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import { BagType } from '../models/bag-type.model';
import { PackingType } from '../models/packing-type.model';
import { BagSpecification } from '../models/bag-specification.model';
import { ProductBagAssignment } from '../models/product-bag-assignment.model';
import { Product } from '../../product/product.model';
import { CreateBagTypeDto } from '../dto/create-bag-type.dto';
import { UpdateBagTypeDto } from '../dto/update-bag-type.dto';
import { CreatePackingTypeDto } from '../dto/create-packing-type.dto';
import { UpdatePackingTypeDto } from '../dto/update-packing-type.dto';
import { CreateBagSpecDto } from '../dto/create-bag-spec.dto';
import { UpdateBagSpecDto } from '../dto/update-bag-spec.dto';
import { QueryBagSpecDto } from '../dto/query-bag-spec.dto';
import { AssignPackagingDto } from '../dto/assign-packaging.dto';
import { buildPagination } from '../../common/pagination.helper';
import { buildPaginatedResponse } from '../../common/response.helper';

const BAG_SPEC_INCLUDE = [
  {
    model: BagType,
    attributes: ['id', 'name'],
  },
  {
    model: PackingType,
    attributes: ['id', 'name'],
  },
];

@Injectable()
export class BagSpecsService {
  constructor(
    @InjectModel(BagType)
    private readonly bagTypeModel: typeof BagType,
    @InjectModel(PackingType)
    private readonly packingTypeModel: typeof PackingType,
    @InjectModel(BagSpecification)
    private readonly bagSpecModel: typeof BagSpecification,
    @InjectModel(ProductBagAssignment)
    private readonly assignmentModel: typeof ProductBagAssignment,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
  ) {}

  // ─── BAG TYPES ────────────────────────────────────────────────────────────

  async findAllBagTypes(
    isActive?: boolean,
    companyId?: number,
  ): Promise<BagType[]> {
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (companyId) where.companyId = companyId;
    return this.bagTypeModel.findAll({
      where,
      order: [['name', 'ASC']],
    });
  }

  async createBagType(
    dto: CreateBagTypeDto,
    companyId?: number,
  ): Promise<BagType> {
    const normalized = dto.name.trim().toUpperCase();
    const whereCondition: any = { name: normalized };
    if (companyId) whereCondition.companyId = companyId;
    const existing = await this.bagTypeModel.findOne({
      where: whereCondition,
    });
    if (existing) {
      throw new BadRequestException(`Bag Type '${normalized}' already exists`);
    }
    return this.bagTypeModel.create({
      ...dto,
      name: normalized,
      companyId,
    });
  }

  async updateBagType(
    id: number,
    dto: UpdateBagTypeDto,
    companyId?: number,
  ): Promise<BagType> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const bagType = await this.bagTypeModel.findOne({ where: whereCondition });
    if (!bagType) throw new NotFoundException('Bag Type not found');

    if (dto.name) {
      const normalized = dto.name.trim().toUpperCase();
      const nameCheckCond: any = { name: normalized, id: { [Op.ne]: id } };
      if (companyId) nameCheckCond.companyId = companyId;
      const existing = await this.bagTypeModel.findOne({
        where: nameCheckCond,
      });
      if (existing) {
        throw new BadRequestException(
          `Bag Type '${normalized}' already exists`,
        );
      }
      dto.name = normalized;
    }

    await bagType.update(dto);
    return bagType.reload();
  }

  async deleteBagType(id: number, companyId?: number): Promise<void> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const bagType = await this.bagTypeModel.findOne({ where: whereCondition });
    if (!bagType) throw new NotFoundException('Bag Type not found');

    const count = await this.bagSpecModel.count({ where: { bagTypeId: id } });
    if (count > 0) {
      throw new BadRequestException(
        'Cannot delete Bag Type as it is used in one or more Bag Specifications',
      );
    }

    await bagType.destroy();
  }

  // ─── PACKING TYPES ────────────────────────────────────────────────────────

  async findAllPackingTypes(
    isActive?: boolean,
    companyId?: number,
  ): Promise<PackingType[]> {
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (companyId) where.companyId = companyId;
    return this.packingTypeModel.findAll({
      where,
      order: [['name', 'ASC']],
    });
  }

  async createPackingType(
    dto: CreatePackingTypeDto,
    companyId?: number,
  ): Promise<PackingType> {
    const normalized = dto.name.trim().toUpperCase();
    const whereCondition: any = { name: normalized };
    if (companyId) whereCondition.companyId = companyId;
    const existing = await this.packingTypeModel.findOne({
      where: whereCondition,
    });
    if (existing) {
      throw new BadRequestException(
        `Packing Type '${normalized}' already exists`,
      );
    }
    return this.packingTypeModel.create({
      ...dto,
      name: normalized,
      companyId,
    });
  }

  async updatePackingType(
    id: number,
    dto: UpdatePackingTypeDto,
    companyId?: number,
  ): Promise<PackingType> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const packingType = await this.packingTypeModel.findOne({
      where: whereCondition,
    });
    if (!packingType) throw new NotFoundException('Packing Type not found');

    if (dto.name) {
      const normalized = dto.name.trim().toUpperCase();
      const nameCheckCond: any = { name: normalized, id: { [Op.ne]: id } };
      if (companyId) nameCheckCond.companyId = companyId;
      const existing = await this.packingTypeModel.findOne({
        where: nameCheckCond,
      });
      if (existing) {
        throw new BadRequestException(
          `Packing Type '${normalized}' already exists`,
        );
      }
      dto.name = normalized;
    }

    await packingType.update(dto);
    return packingType.reload();
  }

  async deletePackingType(id: number, companyId?: number): Promise<void> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const packingType = await this.packingTypeModel.findOne({
      where: whereCondition,
    });
    if (!packingType) throw new NotFoundException('Packing Type not found');

    const count = await this.bagSpecModel.count({
      where: { packingTypeId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        'Cannot delete Packing Type as it is used in one or more Bag Specifications',
      );
    }

    await packingType.destroy();
  }

  // ─── BAG SPECIFICATIONS ───────────────────────────────────────────────────

  async findAllSpecs(query: QueryBagSpecDto & { companyId?: number }) {
    const {
      search,
      bagTypeId,
      packingTypeId,
      isActive,
      page,
      limit,
      companyId,
    } = query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {};
    if (isActive !== undefined) whereClause.isActive = isActive;
    if (bagTypeId) whereClause.bagTypeId = bagTypeId;
    if (packingTypeId) whereClause.packingTypeId = packingTypeId;
    if (companyId) whereClause.companyId = companyId;

    const bagTypeWhere: any = {};
    if (search) {
      bagTypeWhere.name = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await this.bagSpecModel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: BagType,
          attributes: ['id', 'name'],
          ...(search ? { where: bagTypeWhere, required: false } : {}),
        },
        {
          model: PackingType,
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      limit: finalLimit,
      offset,
      order: [
        [{ model: BagType, as: 'bagType' }, 'name', 'ASC'],
        [{ model: PackingType, as: 'packingType' }, 'name', 'ASC'],
      ],
    });

    return buildPaginatedResponse(rows, count, page || 1, finalLimit);
  }

  async findOneSpec(id: number, companyId?: number): Promise<BagSpecification> {
    const whereCondition: any = { id, isActive: true };
    if (companyId) whereCondition.companyId = companyId;
    const spec = await this.bagSpecModel.findOne({
      where: whereCondition,
      include: BAG_SPEC_INCLUDE,
    });
    if (!spec) throw new NotFoundException('Bag Specification not found');
    return spec;
  }

  async createSpec(
    dto: CreateBagSpecDto,
    companyId?: number,
  ): Promise<BagSpecification> {
    const bagTypeWhereCond: any = { id: dto.bagTypeId, isActive: true };
    if (companyId) bagTypeWhereCond.companyId = companyId;
    const bagType = await this.bagTypeModel.findOne({
      where: bagTypeWhereCond,
    });
    if (!bagType)
      throw new BadRequestException('Bag Type not found or inactive');

    if (dto.packingTypeId) {
      const packingTypeWhereCond: any = {
        id: dto.packingTypeId,
        isActive: true,
      };
      if (companyId) packingTypeWhereCond.companyId = companyId;
      const packingType = await this.packingTypeModel.findOne({
        where: packingTypeWhereCond,
      });
      if (!packingType)
        throw new BadRequestException('Packing Type not found or inactive');
    }

    const spec = await this.bagSpecModel.create({ ...dto, companyId });
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  async updateSpec(
    id: number,
    dto: UpdateBagSpecDto,
    companyId?: number,
  ): Promise<BagSpecification> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const spec = await this.bagSpecModel.findOne({ where: whereCondition });
    if (!spec) throw new NotFoundException('Bag Specification not found');

    if (dto.bagTypeId) {
      const bagTypeWhereCond: any = { id: dto.bagTypeId, isActive: true };
      if (companyId) bagTypeWhereCond.companyId = companyId;
      const bagType = await this.bagTypeModel.findOne({
        where: bagTypeWhereCond,
      });
      if (!bagType)
        throw new BadRequestException('Bag Type not found or inactive');
    }

    if (dto.packingTypeId) {
      const packingTypeWhereCond: any = {
        id: dto.packingTypeId,
        isActive: true,
      };
      if (companyId) packingTypeWhereCond.companyId = companyId;
      const packingType = await this.packingTypeModel.findOne({
        where: packingTypeWhereCond,
      });
      if (!packingType)
        throw new BadRequestException('Packing Type not found or inactive');
    }

    await spec.update(dto);
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  async deleteSpec(id: number, companyId?: number): Promise<BagSpecification> {
    const whereCondition: any = { id };
    if (companyId) whereCondition.companyId = companyId;
    const spec = await this.bagSpecModel.findOne({ where: whereCondition });
    if (!spec) throw new NotFoundException('Bag Specification not found');
    await spec.update({ isActive: false });
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  // ─── PRODUCT PACKAGING ASSIGNMENTS ───────────────────────────────────────

  async getProductPackaging(
    productId: number,
    companyId?: number,
  ): Promise<BagSpecification[]> {
    const productWhere: any = { id: productId };
    if (companyId) productWhere.companyId = companyId;
    const product = await this.productModel.findOne({ where: productWhere });
    if (!product) throw new NotFoundException('Product not found');

    const assignments = await this.assignmentModel.findAll({
      where: { productId },
      include: [
        {
          model: BagSpecification,
          where: companyId ? { companyId } : undefined,
          include: BAG_SPEC_INCLUDE,
        },
      ],
    });

    return assignments.map((a) => a.bagSpecification);
  }

  async assignProductPackaging(
    productId: number,
    dto: AssignPackagingDto,
    companyId?: number,
  ): Promise<BagSpecification[]> {
    const productWhere: any = { id: productId };
    if (companyId) productWhere.companyId = companyId;
    const product = await this.productModel.findOne({ where: productWhere });
    if (!product) throw new NotFoundException('Product not found');

    const { bagSpecificationIds } = dto;

    // Validate all provided IDs exist and are active
    if (bagSpecificationIds.length > 0) {
      const foundCond: any = { id: bagSpecificationIds, isActive: true };
      if (companyId) foundCond.companyId = companyId;
      const found = await this.bagSpecModel.findAll({
        where: foundCond,
      });
      if (found.length !== bagSpecificationIds.length) {
        throw new BadRequestException(
          'One or more Bag Specifications not found or inactive',
        );
      }
    }

    // Atomic replace: delete old assignments, insert new ones
    await this.assignmentModel.destroy({ where: { productId } });

    if (bagSpecificationIds.length > 0) {
      const newAssignments = bagSpecificationIds.map((bagSpecificationId) => ({
        productId,
        bagSpecificationId,
        companyId,
      }));
      await this.assignmentModel.bulkCreate(newAssignments, {
        ignoreDuplicates: true,
      });
    }

    return this.getProductPackaging(productId);
  }
}
