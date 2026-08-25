import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Transaction } from 'sequelize';
import { Quotation } from '../models/quotation.model';
import { QuotationItem } from '../models/quotation-item.model';
import { QuotationSequence } from '../models/quotation-sequence.model';
import { PartnerFollowUp } from '../../masters/partner/partner-followup.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { BagSpecification } from '../../masters/bag-specs/models/bag-specification.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { BagType } from '../../masters/bag-specs/models/bag-type.model';
import { PartnerRole } from '../../masters/partner-role/partner-role.model';
import { User } from '../../users/models/user.model';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { UpdateQuotationDto } from '../dto/update-quotation.dto';
import { QueryQuotationDto } from '../dto/query-quotation.dto';
import { QuotationNumberService } from './quotation-number.service';

const QUOTATION_INCLUDE = [
  {
    model: Partner,
    as: 'buyer',
    attributes: ['id', 'entityName', 'country', 'partnerRoleId'],
    include: [
      {
        model: PartnerRole,
        attributes: ['id', 'name'],
      },
    ],
  },
  {
    model: Partner,
    as: 'importer',
    attributes: ['id', 'entityName', 'country', 'partnerRoleId'],
    required: false,
    include: [
      {
        model: PartnerRole,
        attributes: ['id', 'name'],
      },
    ],
  },
  {
    model: User,
    as: 'createdByUser',
    attributes: ['id', 'name'],
    required: false,
  },
  {
    model: User,
    as: 'generatedByUser',
    attributes: ['id', 'name'],
    required: false,
  },
];

const ITEM_INCLUDE = [
  {
    model: Product,
    attributes: ['id', 'name', 'qualitySubType'],
  },
  {
    model: BagSpecification,
    as: 'bagSpecification',
    required: false,
    include: [
      { model: BagType, attributes: ['id', 'name'] },
      { model: PackingType, attributes: ['id', 'name'] },
    ],
  },
  {
    model: PackingType,
    as: 'packingType',
    required: false,
    attributes: ['id', 'name'],
  },
];

@Injectable()
export class QuotationService {
  constructor(
    @InjectModel(Quotation)
    private readonly quotationModel: typeof Quotation,
    @InjectModel(QuotationItem)
    private readonly itemModel: typeof QuotationItem,
    @InjectModel(QuotationSequence)
    private readonly sequenceModel: typeof QuotationSequence,
    @InjectModel(PartnerFollowUp)
    private readonly followUpModel: typeof PartnerFollowUp,
    private readonly sequelize: Sequelize,
    private readonly quotationNumberService: QuotationNumberService,
  ) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────

  async create(dto: CreateQuotationDto, userId: number): Promise<Quotation> {
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (tx) => {
        // 1. Generate atomic, concurrency-safe quotation number
        const period = QuotationNumberService.currentPeriod();
        const quotationNumber = await this.quotationNumberService.nextNumber(
          period,
          tx,
        );

        // 2. Create quotation header
        const quotation = await this.quotationModel.create(
          {
            quotationNumber,
            status: 'Generated',
            buyerId: dto.buyerId,
            importerId: dto.importerId ?? null,
            destinationCountry: dto.destinationCountry,
            followUpId: dto.followUpId ?? null,
            currencyCode: dto.currencyCode,
            generatedBy: userId,
            generatedAt: new Date(),
            createdBy: userId,
          } as any,
          { transaction: tx },
        );

        // 3. Create quotation item (Phase-1: exactly 1)
        const itemDto = dto.items[0];
        await this.itemModel.create(
          {
            quotationId: quotation.id,
            productId: itemDto.productId,
            subTypeSpec: itemDto.subTypeSpec ?? null,
            packagingId: itemDto.packagingId ?? null,
            packingTypeId: itemDto.packingTypeId ?? null,
            purity: itemDto.purity ?? null,
            offeredPrice: itemDto.offeredPrice,
            sortOrder: 0,
          } as any,
          { transaction: tx },
        );

        // 4. Create follow-up timeline activity
        await this.followUpModel.create(
          {
            partnerId: dto.buyerId,
            entityType: 'Quotation',
            entityId: quotation.id,
            communicationType: 'QUOTATION',
            followupDate: new Date(),
            status: 'Completed',
            ourResponse: null,
            createdBy: userId,
            isActive: true,
          } as any,
          { transaction: tx },
        );

        // 5. Return fully-loaded quotation with all associations
        return this.findOne(quotation.id, tx);
      },
    );
  }

  // ─── READ (LIST) ──────────────────────────────────────────────────────────

  async findAll(query: QueryQuotationDto) {
    const { buyerId, importerId, status, search, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = { deletedAt: null };

    if (buyerId) whereClause.buyerId = buyerId;
    if (importerId) whereClause.importerId = importerId;
    if (status) whereClause.status = status;
    if (search) {
      whereClause.quotationNumber = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await this.quotationModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
      include: [
        ...QUOTATION_INCLUDE,
        {
          model: QuotationItem,
          as: 'items',
          include: ITEM_INCLUDE,
        },
      ],
      distinct: true,
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  // ─── READ (SINGLE) ────────────────────────────────────────────────────────

  async findOne(id: number, transaction?: Transaction): Promise<Quotation> {
    const quotation = await this.quotationModel.findOne({
      where: { id, deletedAt: null },
      include: [
        ...QUOTATION_INCLUDE,
        {
          model: QuotationItem,
          as: 'items',
          include: ITEM_INCLUDE,
        },
      ],
      transaction,
    });

    if (!quotation) {
      throw new NotFoundException(`Quotation #${id} not found`);
    }
    return quotation;
  }

  // ─── UPDATE (PATCH) ───────────────────────────────────────────────────────

  async update(
    id: number,
    dto: UpdateQuotationDto,
    userId: number,
  ): Promise<Quotation> {
    const quotation = await this.quotationModel.findOne({
      where: { id, deletedAt: null },
    });

    if (!quotation) {
      throw new NotFoundException(`Quotation #${id} not found`);
    }

    const allowedStatuses = [
      'Draft', 'Generated', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled',
    ];
    if (dto.status && !allowedStatuses.includes(dto.status)) {
      throw new BadRequestException(`Invalid status: ${dto.status}`);
    }

    await quotation.update({
      ...(dto.importerId !== undefined && { importerId: dto.importerId }),
      ...(dto.destinationCountry && { destinationCountry: dto.destinationCountry }),
      ...(dto.currencyCode && { currencyCode: dto.currencyCode }),
      ...(dto.status && { status: dto.status }),
      lastModifiedBy: userId,
      lastModifiedAt: new Date(),
    });

    return this.findOne(id);
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  async softDelete(id: number, userId: number): Promise<{ success: boolean; message: string }> {
    const quotation = await this.quotationModel.findOne({
      where: { id, deletedAt: null },
    });

    if (!quotation) {
      throw new NotFoundException(`Quotation #${id} not found`);
    }

    await quotation.update({
      deletedAt: new Date(),
      deletedBy: userId,
      status: 'Cancelled',
      lastModifiedBy: userId,
      lastModifiedAt: new Date(),
    });

    return { success: true, message: `Quotation ${quotation.quotationNumber} cancelled and soft-deleted` };
  }
}
