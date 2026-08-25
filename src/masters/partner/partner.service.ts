import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Partner } from './partner.model';
import { PartnerContact } from './partner-contact.model';
import { PartnerProduct } from './partner-product.model';
import { PartnerFollowUp } from './partner-followup.model';
import { PartnerDnbReport } from './partner-dnb-report.model';
import { PartnerRole } from '../partner-role/partner-role.model';
import { Product } from '../product/product.model';
import { PartnerRoleDynamicConfig } from '../partner-role/partner-role-dynamic-config.model';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnerDto } from './dto/query-partner.dto';
import { buildPagination } from '../common/pagination.helper';
import { buildSearchQuery } from '../common/search.helper';
import { buildPaginatedResponse } from '../common/response.helper';
import { DeletionValidatorService } from '../deletion-validator.service';
import { AuditService } from '../../audit/services/audit.service';

const INCLUDE_RELATIONS = [
  {
    model: PartnerRole,
    attributes: ['id', 'name'],
    where: { isActive: true },
    required: false,
  },
  {
    model: PartnerContact,
    attributes: [
      'id',
      'name',
      'designation',
      'phone',
      'email',
      'communicationType',
      'isPrimary',
    ],
  },
  {
    model: Product,
    attributes: ['id', 'name'],
    where: { isActive: true },
    required: false,
  },
  {
    model: PartnerFollowUp,
    where: { isActive: true },
    required: false,
    attributes: ['id', 'followupDate', 'nextFollowupDate', 'status', 'communicationType'],
  },
  {
    model: PartnerDnbReport,
    as: 'latestDnbReport',
    required: false,
  },
  {
    model: PartnerDnbReport,
    as: 'dnbReports',
    required: false,
  },
];

@Injectable()
export class PartnerService {
  constructor(
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(PartnerContact)
    private readonly partnerContactModel: typeof PartnerContact,
    @InjectModel(PartnerProduct)
    private readonly partnerProductModel: typeof PartnerProduct,
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(PartnerRoleDynamicConfig)
    private readonly dynamicConfigModel: typeof PartnerRoleDynamicConfig,
    private sequelize: Sequelize,
    private readonly deletionValidator: DeletionValidatorService,
    private readonly auditService: AuditService,
  ) {}

  private async validateForeignKeys(
    partnerRoleId?: number,
    productIds?: number[],
  ) {
    if (partnerRoleId) {
      const role = await this.partnerRoleModel.findOne({
        where: { id: partnerRoleId, isActive: true },
      });
      if (!role)
        throw new BadRequestException('Partner Role not found or inactive');
    }
    if (productIds && productIds.length > 0) {
      const products = await this.productModel.findAll({
        where: { id: { [Op.in]: productIds }, isActive: true },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException(
          'One or more Products not found or inactive',
        );
      }
    }
  }

  async create(dto: CreatePartnerDto): Promise<Partner> {
    const normalizedName = dto.entityName.trim().toUpperCase();

    if (dto.address) dto.address = dto.address.trim();
    if (dto.city) dto.city = dto.city.trim();

    await this.validateForeignKeys(
      dto.partnerRoleId,
      dto.productIds,
    );

    return await this.sequelize.transaction(async (transaction) => {
      const { contacts, productIds, ...partnerData } = dto;
      const partner = await this.partnerModel.create(
        {
          ...partnerData,
          entityName: normalizedName,
        },
        { transaction },
      );


      if (dto.contacts && dto.contacts.length > 0) {
        const contactsPayload = dto.contacts.map((c) => ({
          ...c,
          partnerId: partner.id,
        }));
        await this.partnerContactModel.bulkCreate(contactsPayload, {
          transaction,
        });
      }

      if (dto.productIds && dto.productIds.length > 0) {
        const uniqueProductIds = [...new Set(dto.productIds)];
        const productsPayload = uniqueProductIds.map((pId) => ({
          partnerId: partner.id,
          productId: pId,
        }));
        await this.partnerProductModel.bulkCreate(productsPayload, {
          transaction,
        });
      }

      return partner;
    });
  }

  async findAll(query: QueryPartnerDto & { allowedPartnerRoleIds?: number[] }) {
    const { search, isActive, partnerRoleId, country, dnbRiskFactor, page, limit, allowedPartnerRoleIds } = query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {
      ...buildSearchQuery(search, ['entityName']),
    };

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }
    if (partnerRoleId) {
      whereClause.partnerRoleId = partnerRoleId;
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

    // RBAC-based restriction: limit to allowed partner role IDs
    if (allowedPartnerRoleIds && allowedPartnerRoleIds.length > 0) {
      if (whereClause.partnerRoleId) {
        // Already filtered by a specific role — confirmed allowed by controller
        // no-op (whereClause.partnerRoleId is already set)
      } else {
        whereClause.partnerRoleId = { [Op.in]: allowedPartnerRoleIds };
      }
    }

    // Handle D&B Risk Factor / Failure Score filter dynamically on latestDnbReport relation
    const filterKey = dnbRiskFactor ? dnbRiskFactor.toUpperCase() : null;

    const includes = INCLUDE_RELATIONS.map((inc) => {
      if ((inc as any).as === 'latestDnbReport') {
        if (filterKey && filterKey !== 'UNKNOWN') {
          let whereCond: any = {};
          const safeIntScore = `CASE WHEN "latestDnbReport"."failure_score" ~ '^[0-9]+$' THEN CAST("latestDnbReport"."failure_score" AS INTEGER) ELSE NULL END`;
          if (filterKey === 'VERY_LOW') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 90 AND 100)`),
                { failureScore: 'VERY_LOW' },
              ],
            };
          } else if (filterKey === 'LOW') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 75 AND 89)`),
                { failureScore: 'LOW' },
                { riskFactor: 'LOW' },
              ],
            };
          } else if (filterKey === 'MODERATE_LOW') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 60 AND 74)`),
                { failureScore: 'MODERATE_LOW' },
              ],
            };
          } else if (filterKey === 'MODERATE') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 40 AND 59)`),
                { failureScore: 'MODERATE' },
                { riskFactor: 'MODERATE' },
              ],
            };
          } else if (filterKey === 'HIGH') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 20 AND 39)`),
                { failureScore: 'HIGH' },
                { riskFactor: 'HIGH' },
              ],
            };
          } else if (filterKey === 'VERY_HIGH') {
            whereCond = {
              [Op.or]: [
                Sequelize.literal(`(${safeIntScore} BETWEEN 1 AND 19)`),
                { failureScore: 'VERY_HIGH' },
              ],
            };
          }

          return {
            ...inc,
            where: whereCond,
            required: true,
          };
        }
      }
      return inc;
    });

    if (filterKey === 'UNKNOWN') {
      whereClause['$latestDnbReport.id$'] = { [Op.is]: null };
    }

    const { rows, count } = await this.partnerModel.findAndCountAll({
      where: whereClause,
      attributes: {
        include: [
          [
            Sequelize.literal(`(
              SELECT COUNT(DISTINCT "q"."id")::int
              FROM "quotations" AS "q"
              WHERE "q"."buyer_id" = "Partner"."id"
              AND "q"."deleted_at" IS NULL
              AND "q"."status" != 'Draft'
            )`),
            'quotationCount',
          ],
        ],
      },
      limit: finalLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: includes,
      distinct: true,
    });

    return buildPaginatedResponse(rows, count, page || 1, finalLimit);
  }


  /**
   * Lightweight dropdown endpoint — returns only id + entityName.
   * Supports server-side search (ILIKE), pagination (for infinite scroll),
   * and optional roleName filter (JOIN on partner_roles by name).
   *
   * Returns a paginated envelope { data, total, page, totalPages }.
   * Existing callers that use `res.data?.data || res.data || []` continue to work.
   */
  async findOptions(params: {
    partnerRoleId?: number;
    roleName?: string;
    search?: string;
    isActive?: boolean;
    limit?: number;
    page?: number;
  }): Promise<{ data: { id: number; entityName: string }[]; total: number; page: number; totalPages: number }> {
    const where: any = { isActive: params.isActive !== undefined ? params.isActive : true };

    if (params.partnerRoleId) {
      where.partnerRoleId = params.partnerRoleId;
    }
    if (params.search && params.search.trim()) {
      where.entityName = { [Op.iLike]: `%${params.search.trim()}%` };
    }

    const limit = Math.min(Math.max(params.limit || 10, 1), 50);
    const page = Math.max(params.page || 1, 1);
    const offset = (page - 1) * limit;

    // Build include for roleName JOIN (e.g. for Importer-only dropdown)
    const include: any[] = [];
    if (params.roleName) {
      include.push({
        model: this.partnerRoleModel,
        attributes: [],
        where: { name: { [Op.iLike]: params.roleName.trim() } },
        required: true,
      });
    }

    const { rows, count } = await this.partnerModel.findAndCountAll({
      where,
      attributes: ['id', 'entityName'],
      order: [['entityName', 'ASC']],
      limit,
      offset,
      include,
      distinct: true,
    });

    return {
      data: rows.map((r) => ({ id: r.id, entityName: r.entityName })),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number): Promise<Partner> {
    const partner = await this.partnerModel.findOne({
      where: { id, isActive: true },
      include: INCLUDE_RELATIONS,
    });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    return partner;
  }

  async getDistinctCountries(): Promise<string[]> {
    const results = await this.partnerModel.findAll({
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('country')), 'country']
      ],
      where: { isActive: true },
      raw: true,
    });
    return results.map((r: any) => r.country).filter(Boolean).sort();
  }

  async findOneActive(id: number): Promise<Partner> {
    return this.findOne(id);
  }

  async findOneAnyState(id: number): Promise<Partner> {
    const partner = await this.partnerModel.findOne({
      where: { id },
      include: INCLUDE_RELATIONS,
    });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    return partner;
  }

  async update(id: number, dto: UpdatePartnerDto): Promise<Partner> {
    const partner = await this.findOneActive(id);

    if (dto.entityName) {
      dto.entityName = dto.entityName.trim().toUpperCase();
    }
    if (dto.address) {
      dto.address = dto.address.trim();
    }
    if (dto.city) {
      dto.city = dto.city.trim();
    }

    if (dto.partnerRoleId || dto.productIds) {
      await this.validateForeignKeys(
        dto.partnerRoleId,
        dto.productIds,
      );
    }

    await this.sequelize.transaction(async (transaction) => {
      const { contacts, productIds, ...updateData } = dto;
      await partner.update(updateData, { transaction });

      if (dto.contacts !== undefined) {
        await this.partnerContactModel.destroy({
          where: { partnerId: id },
          transaction,
        });
        if (dto.contacts.length > 0) {
          const contactsPayload = dto.contacts.map((c) => ({
            ...c,
            partnerId: id,
          }));
          await this.partnerContactModel.bulkCreate(contactsPayload, {
            transaction,
          });
        }
      }

      if (dto.productIds !== undefined) {
        await this.partnerProductModel.destroy({
          where: { partnerId: id },
          transaction,
        });
        if (dto.productIds.length > 0) {
          const uniqueProductIds = [...new Set(dto.productIds)];
          const productsPayload = uniqueProductIds.map((pId) => ({
            partnerId: id,
            productId: pId,
          }));
          await this.partnerProductModel.bulkCreate(productsPayload, {
            transaction,
          });
        }
      }
    });

    return partner.reload({ include: INCLUDE_RELATIONS });
  }

  async restore(id: number, user: any): Promise<Partner> {
    const partner = await this.findOneAnyState(id);
    const oldIsActive = partner.isActive;
    await partner.update({ isActive: true });

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'Partner',
      entityId: partner.id,
      action: 'RESTORE',
      oldValue: { isActive: oldIsActive },
      newValue: { isActive: true },
    });

    return partner.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: number, reason?: string, user?: any): Promise<Partner> {
    const partner = await this.findOneActive(id);
    await partner.update({ isActive: false });

    if (user) {
      await this.auditService.writeLog({
        clientId: user.clientId || null,
        companyId: user.companyId || null,
        userId: user.userId,
        entityType: 'Partner',
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

    return partner.reload({ include: INCLUDE_RELATIONS });
  }

  async removePermanent(id: number, reason: string, user: any): Promise<void> {
    const partner = await this.findOneAnyState(id);
    // Note: Partner contacts and products are automatically deleted via onDelete: CASCADE db config.

    const oldValue = {
      ...partner.toJSON(),
      deletedAt: new Date(),
      deletedBy: user.userId,
      deleteReason: reason || 'No reason provided',
    };

    await partner.destroy();

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'Partner',
      entityId: id,
      action: 'FORCE_DELETE',
      oldValue,
      newValue: null,
    });
  }
}
