import {
  Injectable,
  Logger,
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
import { User } from '../users/models/user.model';
import { buildPagination } from '../masters/common/pagination.helper';
import { buildSearchQuery } from '../masters/common/search.helper';
import { buildPaginatedResponse } from '../masters/common/response.helper';
import { AuditService } from '../audit/services/audit.service';
import { EnquiryShipmentMode } from './enquiry.constants';
import { NotificationDispatchService } from '../notifications/services/notification-dispatch.service';
import { NotificationChannel, NotificationTemplate, NotificationRecipient } from '../notifications/notification.types';
import { NotificationsGateway } from '../notifications/gateways/notifications.gateway';
import { NotificationsService, NotificationType } from '../notifications/services/notifications.service';
import { RbacService } from '../rbac/services/rbac.service';

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
  {
    model: User,
    as: 'creator',
    attributes: ['id', 'name', 'email'],
    required: false,
  },
];

@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);

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
    private readonly notificationDispatchService: NotificationDispatchService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly rbacService: RbacService,
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
    companyId: number,
    partnerRoleId?: number,
    partnerId?: number,
    productId?: number,
    packingTypeId?: number,
  ) {
    if (partnerRoleId) {
      const role = await this.partnerRoleModel.findOne({
        where: { id: partnerRoleId, isActive: true, companyId },
      });
      if (!role) throw new BadRequestException('Partner Role not found or inactive');
    }
    if (partnerId) {
      const partner = await this.partnerModel.findOne({
        where: { id: partnerId, isActive: true, companyId },
      });
      if (!partner) throw new BadRequestException('Partner not found or inactive');
    }
    if (productId) {
      const product = await this.productModel.findOne({
        where: { id: productId, isActive: true, companyId },
      });
      if (!product) throw new BadRequestException('Product not found or inactive');
    }
    if (packingTypeId) {
      const packing = await this.packingTypeModel.findOne({
        where: { id: packingTypeId, isActive: true, companyId },
      });
      if (!packing) throw new BadRequestException('Packing Type not found or inactive');
    }
  }

  private normalizeLogisticsPayload(dto: any): any {
    const payload = { ...dto };

    // Sync destinationPort and podPort
    if (payload.destinationPort) {
      payload.podPort = payload.destinationPort;
    } else if (payload.podPort) {
      payload.destinationPort = payload.podPort;
    }

    if (payload.shipmentMode) {
      const mode = payload.shipmentMode;
      if (mode === EnquiryShipmentMode.SHIP) {
        // Clear land state, city, zip, and station fields (Country fields are allowed/required)
        payload.originState = null;
        payload.originCity = null;
        payload.originZipCode = null;
        payload.originStationCode = null;
        payload.destinationState = null;
        payload.destinationCity = null;
        payload.destinationZipCode = null;
        payload.destinationStationCode = null;
      } else if (mode === EnquiryShipmentMode.ROAD) {
        // Clear port and railway station fields
        payload.originPort = null;
        payload.destinationPort = null;
        payload.podPort = null;
        payload.originStationCode = null;
        payload.destinationStationCode = null;
      } else if (mode === EnquiryShipmentMode.RAIL) {
        // Clear port and zip code fields
        payload.originPort = null;
        payload.destinationPort = null;
        payload.podPort = null;
        payload.originZipCode = null;
        payload.destinationZipCode = null;
      }
    }

    // Limit currency to upper case ISO code
    if (payload.bidCurrency) {
      payload.bidCurrency = payload.bidCurrency.trim().toUpperCase();
    }

    return payload;
  }

  private validateLogistics(data: any): void {
    if (data.shipmentMode) {
      const mode = data.shipmentMode;
      if (mode === EnquiryShipmentMode.SHIP) {
        if (!data.originCountryId || !data.originCountryId.trim()) {
          throw new BadRequestException('Origin Country is required for Ship mode');
        }
        if (!data.originPort || !data.originPort.trim()) {
          throw new BadRequestException('Origin Port is required for Ship mode');
        }
        if (!data.destinationCountry || !data.destinationCountry.trim()) {
          throw new BadRequestException('Destination Country is required for Ship mode');
        }
        if (!data.destinationPort || !data.destinationPort.trim()) {
          throw new BadRequestException('Destination Port is required for Ship mode');
        }
        // Enforce mutually exclusive land state and city fields
        if (
          data.originState ||
          data.originCity ||
          data.destinationState ||
          data.destinationCity
        ) {
          throw new BadRequestException('States and Cities are not allowed for Ship mode');
        }
      } else if (mode === EnquiryShipmentMode.ROAD || mode === EnquiryShipmentMode.RAIL) {
        if (!data.originCountryId || !data.originCountryId.trim()) {
          throw new BadRequestException(`Origin Country is required for ${mode} mode`);
        }
        if (!data.originState || !data.originState.trim()) {
          throw new BadRequestException(`Origin State is required for ${mode} mode`);
        }
        if (!data.originCity || !data.originCity.trim()) {
          throw new BadRequestException(`Origin City is required for ${mode} mode`);
        }
        if (!data.destinationCountry || !data.destinationCountry.trim()) {
          throw new BadRequestException(`Destination Country is required for ${mode} mode`);
        }
        if (!data.destinationState || !data.destinationState.trim()) {
          throw new BadRequestException(`Destination State is required for ${mode} mode`);
        }
        if (!data.destinationCity || !data.destinationCity.trim()) {
          throw new BadRequestException(`Destination City is required for ${mode} mode`);
        }
        // Enforce mutually exclusive port fields
        if (data.originPort || data.destinationPort || data.podPort) {
          throw new BadRequestException(`Ports are not allowed for ${mode} mode`);
        }
      } else {
        throw new BadRequestException(`Invalid shipment mode: ${mode}`);
      }
    }

    // Bid validation
    const bidAmount = data.buyingInterest;
    if (bidAmount !== undefined && bidAmount !== null && bidAmount !== '') {
      if (Number(bidAmount) < 0) {
        throw new BadRequestException('Bid Amount must be greater than or equal to 0');
      }
      if (!data.bidCurrency || !data.bidCurrency.trim()) {
        throw new BadRequestException('Currency is required when Bid Amount is entered');
      }
    }
  }

  async create(dto: CreateEnquiryDto, user: any): Promise<Enquiry> {
    const companyId: number = user?.companyId;
    await this.validateForeignKeys(
      companyId,
      dto.partnerRoleId,
      dto.partnerId,
      dto.productId,
      dto.packingTypeId,
    );

    const normalized = this.normalizeLogisticsPayload(dto);
    // this.validateLogistics(normalized); // Temporarily disabled — Logistics & Locations section hidden from UI

    // Pre-fetch relation names outside the transaction to keep it short
    const [partner, product, packingType, creator] = await Promise.all([
      normalized.partnerId
        ? this.partnerModel.findByPk(normalized.partnerId, { attributes: ['id', 'entityName'] })
        : Promise.resolve(null),
      normalized.productId
        ? this.productModel.findByPk(normalized.productId, { attributes: ['id', 'name'] })
        : Promise.resolve(null),
      normalized.packingTypeId
        ? this.packingTypeModel.findByPk(normalized.packingTypeId, { attributes: ['id', 'name'] })
        : Promise.resolve(null),
      user?.userId
        ? this.sequelize.query('SELECT name FROM users WHERE id = ?', {
            replacements: [user.userId],
            type: QueryTypes.SELECT,
          }).then((res: any) => res[0])
        : Promise.resolve(null),
    ]);

    // ── DB transaction ────────────────────────────────────────────────────────
    const enquiry = await this.sequelize.transaction(async (transaction) => {
      const enquiryNo = await this.generateEnquiryNumber(transaction);
      return this.enquiryModel.create(
        { ...normalized, enquiryNo, createdBy: user?.userId, companyId },
        { transaction },
      );
    });

    // ── Fire-and-forget notification ──────────────────────────────────────────
    // Runs AFTER transaction commits.
    // Any failure is caught by dispatch service and logged to notification_logs.
    // This line NEVER throws — enquiry creation is always unaffected.
    const origin =
      enquiry.originPort ||
      [enquiry.originCity, enquiry.originState, enquiry.originCountryId]
        .filter(Boolean)
        .join(', ');

    const destination =
      enquiry.destinationPort ||
      [enquiry.destinationCity, enquiry.destinationState, enquiry.destinationCountry]
        .filter(Boolean)
        .join(', ');

    this.notificationDispatchService
      .send({
        channel:    NotificationChannel.WHATSAPP,
        template:   NotificationTemplate.NEW_ENQUIRY,
        recipient:  NotificationRecipient.SALES_GROUP,
        entityType: 'Enquiry',
        entityId:   enquiry.id,
        companyId:  user?.companyId || null,
        payload: {
          enquiryNo:     enquiry.enquiryNo,
          customerName:  (partner as any)?.entityName  || undefined,
          product:       (product as any)?.name         || undefined,
          purity:        enquiry.purity                 || undefined,
          quantity:      enquiry.quantity  != null ? String(enquiry.quantity)           : undefined,
          quantityUnit:  'MT',
          packingType:   (packingType as any)?.name     || undefined,
          origin:        origin            || undefined,
          destination:   destination       || undefined,
          shipmentType:  enquiry.shipmentType || undefined,
          shipmentDate:  enquiry.shipmentDate            || undefined,
          bid:           enquiry.buyingInterest != null ? String(enquiry.buyingInterest) : undefined,
          bidCurrency:   enquiry.bidCurrency             || undefined,
          createdByName: (creator as any)?.name          || undefined,
          createdAt:     new Date(),
        },
      })
      .catch((err) =>
        this.logger.error(
          `[Notification] Unhandled error for ${enquiry.enquiryNo}: ${err?.message}`,
          err?.stack,
        ),
      );

    // ── Transport Management Real-Time Notifications ──────────────────────────
    this.notifyTransportTeam(enquiry, (product as any)?.name, (partner as any)?.entityName, user?.companyId).catch(err => {
      this.logger.error(`[Transport Notification] Error: ${err?.message}`, err?.stack);
    });

    return enquiry;
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
      where: { ...whereClause, companyId: (query as any).companyId },
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
      shipmentMode: row.shipmentMode,
      originPort: row.originPort,
      destinationPort: row.destinationPort,
      originState: row.originState,
      originCity: row.originCity,
      destinationCountry: row.destinationCountry,
      destinationState: row.destinationState,
      destinationCity: row.destinationCity,
      originZipCode: row.originZipCode,
      destinationZipCode: row.destinationZipCode,
      originStationCode: row.originStationCode,
      destinationStationCode: row.destinationStationCode,
      bidCurrency: row.bidCurrency,
      createdBy: row.createdBy,
      createdByName: row.creator?.name || null,
      creator: row.creator ? { id: row.creator.id, name: row.creator.name, email: row.creator.email } : null,
    }));

    return buildPaginatedResponse(mappedRows, count, page || 1, finalLimit);
  }

  async findOne(id: string, companyId?: number): Promise<Enquiry> {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const enquiry = await this.enquiryModel.findOne({
      where,
      include: INCLUDE_RELATIONS,
    });
    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }
    return enquiry;
  }

  async update(id: string, dto: UpdateEnquiryDto, user: any): Promise<Enquiry> {
    const companyId: number = user?.companyId;
    const enquiry = await this.findOne(id, companyId);

    if (
      dto.partnerRoleId ||
      dto.partnerId ||
      dto.productId ||
      dto.packingTypeId
    ) {
      await this.validateForeignKeys(
        companyId,
        dto.partnerRoleId,
        dto.partnerId,
        dto.productId,
        dto.packingTypeId,
      );
    }

    // Merge current values with incoming update payload for complete state validation
    const merged = { ...enquiry.toJSON(), ...dto };
    const normalizedMerged = this.normalizeLogisticsPayload(merged);
    // this.validateLogistics(normalizedMerged); // Temporarily disabled — Logistics & Locations section hidden from UI

    // Apply normalization to actual delta properties for DB update
    const normalizedDto = this.normalizeLogisticsPayload(dto);

    await this.sequelize.transaction(async (transaction) => {
      await enquiry.update(
        {
          ...normalizedDto,
          updatedBy: user?.userId,
        },
        { transaction },
      );
    });

    return enquiry.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: string, reason?: string, user?: any): Promise<void> {
    const enquiry = await this.findOne(id, user?.companyId);

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

  async notifyTransportTeam(enquiry: Enquiry, productName: string, buyerName: string, companyId?: number): Promise<void> {
    if (!enquiry?.id) return;
    
    try {
      // Fetch users with access to the Transport Management page (logistics:read)
      // Delegating to RbacService directly instead of raw queries in the business layer
      // The exact resource mapping in the database (phase-15-logistics.ts) is module='logistics', action='VIEW'
      const userIds = await this.rbacService.getUsersWithPermission('logistics', 'VIEW', companyId || null, enquiry.createdBy);

      if (userIds.length > 0) {
        const payload = {
          enquiryId: enquiry.id,
          enquiryNumber: enquiry.enquiryNo,
          productName: productName || 'Unknown Product',
          buyerName: buyerName || 'Unknown Buyer',
          quantity: enquiry.quantity,
          createdAt: enquiry.createdAt,
        };

        for (const uid of userIds) {
          this.notificationsGateway.emitToUser(uid, 'transport:new-enquiry', payload);
        }

        await this.notificationsService.createNotification({
          recipients: userIds,
          type: NotificationType.ENQUIRY,
          referenceType: 'transport_new_enquiry',
          referenceId: 0,
          title: 'New Transport Request',
          category: 'SYSTEM',
          companyId,
          payload,
        });
      }
    } catch (err) {
      this.logger.error(`Error notifying transport team: ${err.message}`, err.stack);
    }
  }
}
