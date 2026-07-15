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
  ) { }

  // ─── BAG TYPES ────────────────────────────────────────────────────────────

  async findAllBagTypes(isActive?: boolean): Promise<BagType[]> {
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    return this.bagTypeModel.findAll({
      where,
      order: [['name', 'ASC']],
    });
  }

  async createBagType(dto: CreateBagTypeDto): Promise<BagType> {
    const normalized = dto.name.trim().toUpperCase();
    const existing = await this.bagTypeModel.findOne({
      where: { name: normalized },
    });
    if (existing) {
      throw new BadRequestException(
        `Bag Type '${normalized}' already exists`,
      );
    }
    return this.bagTypeModel.create({ ...dto, name: normalized });
  }

  async updateBagType(id: number, dto: UpdateBagTypeDto): Promise<BagType> {
    const bagType = await this.bagTypeModel.findByPk(id);
    if (!bagType) throw new NotFoundException('Bag Type not found');

    if (dto.name) {
      const normalized = dto.name.trim().toUpperCase();
      const existing = await this.bagTypeModel.findOne({
        where: { name: normalized, id: { [Op.ne]: id } },
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

  async deleteBagType(id: number): Promise<void> {
    const bagType = await this.bagTypeModel.findByPk(id);
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

  async findAllPackingTypes(isActive?: boolean): Promise<PackingType[]> {
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    return this.packingTypeModel.findAll({
      where,
      order: [['name', 'ASC']],
    });
  }

  async createPackingType(dto: CreatePackingTypeDto): Promise<PackingType> {
    const normalized = dto.name.trim().toUpperCase();
    const existing = await this.packingTypeModel.findOne({
      where: { name: normalized },
    });
    if (existing) {
      throw new BadRequestException(
        `Packing Type '${normalized}' already exists`,
      );
    }
    return this.packingTypeModel.create({ ...dto, name: normalized });
  }

  async updatePackingType(
    id: number,
    dto: UpdatePackingTypeDto,
  ): Promise<PackingType> {
    const packingType = await this.packingTypeModel.findByPk(id);
    if (!packingType) throw new NotFoundException('Packing Type not found');

    if (dto.name) {
      const normalized = dto.name.trim().toUpperCase();
      const existing = await this.packingTypeModel.findOne({
        where: { name: normalized, id: { [Op.ne]: id } },
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

  async deletePackingType(id: number): Promise<void> {
    const packingType = await this.packingTypeModel.findByPk(id);
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

  async findAllSpecs(query: QueryBagSpecDto) {
    const { search, bagTypeId, packingTypeId, isActive, page, limit } = query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {};
    if (isActive !== undefined) whereClause.isActive = isActive;
    if (bagTypeId) whereClause.bagTypeId = bagTypeId;
    if (packingTypeId) whereClause.packingTypeId = packingTypeId;

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

  async findOneSpec(id: number): Promise<BagSpecification> {
    const spec = await this.bagSpecModel.findOne({
      where: { id, isActive: true },
      include: BAG_SPEC_INCLUDE,
    });
    if (!spec) throw new NotFoundException('Bag Specification not found');
    return spec;
  }

  async createSpec(dto: CreateBagSpecDto): Promise<BagSpecification> {
    const bagType = await this.bagTypeModel.findOne({
      where: { id: dto.bagTypeId, isActive: true },
    });
    if (!bagType) throw new BadRequestException('Bag Type not found or inactive');

    if (dto.packingTypeId) {
      const packingType = await this.packingTypeModel.findOne({
        where: { id: dto.packingTypeId, isActive: true },
      });
      if (!packingType)
        throw new BadRequestException('Packing Type not found or inactive');
    }

    const spec = await this.bagSpecModel.create(dto as any);
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  async updateSpec(
    id: number,
    dto: UpdateBagSpecDto,
  ): Promise<BagSpecification> {
    const spec = await this.bagSpecModel.findByPk(id);
    if (!spec) throw new NotFoundException('Bag Specification not found');

    if (dto.bagTypeId) {
      const bagType = await this.bagTypeModel.findOne({
        where: { id: dto.bagTypeId, isActive: true },
      });
      if (!bagType) throw new BadRequestException('Bag Type not found or inactive');
    }

    if (dto.packingTypeId) {
      const packingType = await this.packingTypeModel.findOne({
        where: { id: dto.packingTypeId, isActive: true },
      });
      if (!packingType)
        throw new BadRequestException('Packing Type not found or inactive');
    }

    await spec.update(dto);
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  async deleteSpec(id: number): Promise<BagSpecification> {
    const spec = await this.bagSpecModel.findByPk(id);
    if (!spec) throw new NotFoundException('Bag Specification not found');
    await spec.update({ isActive: false });
    return spec.reload({ include: BAG_SPEC_INCLUDE });
  }

  // ─── PRODUCT PACKAGING ASSIGNMENTS ───────────────────────────────────────

  async getProductPackaging(productId: number): Promise<BagSpecification[]> {
    const product = await this.productModel.findByPk(productId);
    if (!product) throw new NotFoundException('Product not found');

    const assignments = await this.assignmentModel.findAll({
      where: { productId },
      include: [
        {
          model: BagSpecification,
          include: BAG_SPEC_INCLUDE,
        },
      ],
    });

    return assignments.map((a) => a.bagSpecification);
  }

  async assignProductPackaging(
    productId: number,
    dto: AssignPackagingDto,
  ): Promise<BagSpecification[]> {
    const product = await this.productModel.findByPk(productId);
    if (!product) throw new NotFoundException('Product not found');

    const { bagSpecificationIds } = dto;

    // Validate all provided IDs exist and are active
    if (bagSpecificationIds.length > 0) {
      const found = await this.bagSpecModel.findAll({
        where: { id: bagSpecificationIds, isActive: true },
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
      }));
      await this.assignmentModel.bulkCreate(newAssignments, {
        ignoreDuplicates: true,
      });
    }

    return this.getProductPackaging(productId);
  }
}
