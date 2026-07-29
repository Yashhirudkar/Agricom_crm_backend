import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes } from 'sequelize';
import { Enquiry } from './models/enquiry.model';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { QueryEnquiryDto } from './dto/query-enquiry.dto';
import { PartnerRole } from '../masters/partner-role/partner-role.model';
import { Partner } from '../masters/partner/partner.model';
import { Product } from '../masters/product/product.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { buildPagination } from '../masters/common/pagination.helper';
import { buildSearchQuery } from '../masters/common/search.helper';
import { buildPaginatedResponse } from '../masters/common/response.helper';
import { AuditService } from '../audit/services/audit.service';

const INCLUDE_RELATIONS = [
  {
    model: PartnerRole,
    attributes: ['id', 'name'],
    required: false,
  },
  {
    model: Partner,
    attributes: ['id', 'entityName'],
    required: false,
  },
  {
    model: Product,
    attributes: ['id', 'name'],
    required: false,
  },
  {
    model: PackingType,
    attributes: ['id', 'name'],
    required: false,
  },
];

@Injectable()
export class EnquiriesService {
  constructor(
    @InjectModel(Enquiry)
    private readonly enquiryModel: typeof Enquiry,
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(PackingType)
    private readonly packingTypeModel: typeof PackingType,
    private sequelize: Sequelize,
    private readonly auditService: AuditService,
  ) {}

  private async generateEnquiryNumber(transaction?: any): Promise<string> {
    await this.sequelize.query(
      `CREATE SEQUENCE IF NOT EXISTS enquiries_no_seq START 1;`,
      { transaction }
    );
    const result = await this.sequelize.query(
      `SELECT nextval('enquiries_no_seq')`,
      { type: QueryTypes.SELECT, transaction }
    ) as any[];

    const nextNumber = parseInt(result[0].nextval, 10);
    return `ENQ-${String(nextNumber).padStart(6, '0')}`;
  }

  private async validateForeignKeys(
    partnerRoleId?: number,
    partnerId?: number,
    productId?: number,
    packingTypeId?: number,
  ) {
    if (partnerRoleId) {
      const role = await this.partnerRoleModel.findOne({
        where: { id: partnerRoleId, isActive: true },
      });
      if (!role) throw new BadRequestException('Partner Role not found or inactive');
    }
    if (partnerId) {
      const partner = await this.partnerModel.findOne({
        where: { id: partnerId, isActive: true },
      });
      if (!partner) throw new BadRequestException('Partner not found or inactive');
    }
    if (productId) {
      const product = await this.productModel.findOne({
        where: { id: productId, isActive: true },
      });
      if (!product) throw new BadRequestException('Product not found or inactive');
    }
    if (packingTypeId) {
      const packing = await this.packingTypeModel.findOne({
        where: { id: packingTypeId, isActive: true },
      });
      if (!packing) throw new BadRequestException('Packing Type not found or inactive');
    }
  }

  async create(dto: CreateEnquiryDto, user: any): Promise<Enquiry> {
    await this.validateForeignKeys(
      dto.partnerRoleId,
      dto.partnerId,
      dto.productId,
      dto.packingTypeId,
    );

    return await this.sequelize.transaction(async (transaction) => {
      const enquiryNo = await this.generateEnquiryNumber(transaction);

      const enquiry = await this.enquiryModel.create(
        {
          ...dto,
          enquiryNo,
          createdBy: user?.userId,
        },
        { transaction },
      );

      return enquiry;
    });
  }

  async findAll(query: QueryEnquiryDto) {
    const {
      search,
      partnerRoleId,
      partnerId,
      productId,
      status,
      dateFrom,
      dateTo,
      originCountryId,
      shipmentType,
      potentialEnquiry,
      page,
      limit,
    } = query;

    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {
      ...buildSearchQuery(search, ['enquiryNo']), // Search on enquiryNo directly
    };

    if (search) {
        // If there's a search term, we should also search in partner name and product name
        // But buildSearchQuery only works on the primary model directly.
        // We'll use Op.or for relation searches.
        whereClause[Op.or] = [
           { enquiryNo: { [Op.iLike]: `%${search}%` } },
           { '$partner.entity_name$': { [Op.iLike]: `%${search}%` } },
           { '$product.name$': { [Op.iLike]: `%${search}%` } }
        ];
        delete whereClause.enquiryNo;
    }

    if (partnerRoleId) whereClause.partnerRoleId = partnerRoleId;
    if (partnerId) whereClause.partnerId = partnerId;
    if (productId) whereClause.productId = productId;
    if (status) {
      if (typeof status === 'string') {
        const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 1) {
          whereClause.status = { [Op.in]: statuses };
        } else if (statuses.length === 1) {
          whereClause.status = statuses[0];
        }
      } else if (Array.isArray(status)) {
        whereClause.status = { [Op.in]: status };
      } else {
        whereClause.status = status;
      }
    }
    if (originCountryId) whereClause.originCountryId = originCountryId;
    if (shipmentType) whereClause.shipmentType = shipmentType;
    if (potentialEnquiry !== undefined) whereClause.potentialEnquiry = potentialEnquiry;

    if (dateFrom && dateTo) {
      whereClause.enquiryDate = {
        [Op.between]: [dateFrom, dateTo],
      };
    } else if (dateFrom) {
      whereClause.enquiryDate = {
        [Op.gte]: dateFrom,
      };
    } else if (dateTo) {
      whereClause.enquiryDate = {
        [Op.lte]: dateTo,
      };
    }

    const { rows, count } = await this.enquiryModel.findAndCountAll({
      where: whereClause,
      limit: finalLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: INCLUDE_RELATIONS,
      distinct: true,
      subQuery: false,
    });

    const mappedRows = rows.map((row: any) => ({
      id: row.id,
      enquiryNo: row.enquiryNo,
      enquiryDate: row.enquiryDate,
      roleName: row.partnerRole?.name,
      partnerId: row.partnerId,
      partnerName: row.partner?.entityName,
      productName: row.product?.name,
      originCountryId: row.originCountryId,
      purity: row.purity,
      packingName: row.packingType?.name,
      podName: row.podPort,
      shipmentType: row.shipmentType,
      quantity: row.quantity,
      shipmentDate: row.shipmentDate,
      buyingInterest: row.buyingInterest,
      potentialEnquiry: row.potentialEnquiry,
      status: row.status,
    }));

    return buildPaginatedResponse(mappedRows, count, page || 1, finalLimit);
  }

  async findOne(id: string): Promise<Enquiry> {
    const enquiry = await this.enquiryModel.findByPk(id, {
      include: INCLUDE_RELATIONS,
    });
    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }
    return enquiry;
  }

  async update(id: string, dto: UpdateEnquiryDto, user: any): Promise<Enquiry> {
    const enquiry = await this.findOne(id);

    if (
      dto.partnerRoleId ||
      dto.partnerId ||
      dto.productId ||
      dto.packingTypeId
    ) {
      await this.validateForeignKeys(
        dto.partnerRoleId,
        dto.partnerId,
        dto.productId,
        dto.packingTypeId,
      );
    }

    await this.sequelize.transaction(async (transaction) => {
      await enquiry.update(
        {
          ...dto,
          updatedBy: user?.userId,
        },
        { transaction },
      );
    });

    return enquiry.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: string, reason?: string, user?: any): Promise<void> {
    const enquiry = await this.findOne(id);

    const oldValue = {
      ...enquiry.toJSON(),
      deletedAt: new Date(),
      deletedBy: user?.userId,
      deleteReason: reason || 'Deactivated',
    };

    await enquiry.destroy();

    if (user) {
      await this.auditService.writeLog({
        clientId: user.clientId || null,
        companyId: user.companyId || null,
        userId: user.userId,
        entityType: 'Enquiry',
        entityId: null, // UUID cannot be stored in integer column
        action: 'DELETE',
        oldValue,
        newValue: null,
      });
    }
  }
}
