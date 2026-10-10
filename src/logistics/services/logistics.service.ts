import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes } from 'sequelize';

import { Logistics } from '../models/logistics.model';
import { FreightQuote } from '../models/freight-quote.model';
import { FreightChargeMaster } from '../models/freight-charge-master.model';
import { FreightQuoteCharge } from '../models/freight-quote-charge.model';
import { FreightQuoteContainerRate } from '../models/freight-quote-container-rate.model';
import { LogisticsRoute } from '../models/logistics-route.model';
import { Enquiry } from '../../enquiries/models/enquiry.model';
import { EnquiryLoadingPoint } from '../../enquiries/models/enquiry-loading-point.model';
import { EnquiryDestination } from '../../enquiries/models/enquiry-destination.model';
import { EnquiryStatus } from '../../enquiries/enquiry.constants';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { Attachment } from '../../attachments/models/attachment.model';
import { AttachmentsService } from '../../attachments/services/attachments.service';
import { AuditService } from '../../audit/services/audit.service';
import { User } from '../../users/models/user.model';

import { QueryLogisticsDto } from '../dto/query-logistics.dto';
import { CreateFreightQuoteDto } from '../dto/create-freight-quote.dto';
import { CreateChargeMasterDto } from '../dto/create-charge-master.dto';
import { UpdateLogisticsStatusDto } from '../dto/update-logistics-status.dto';

import { PartnerContact } from '../../masters/partner/partner-contact.model';
import { Company } from '../../companies/models/company.model';

@Injectable()
export class LogisticsService {
  constructor(
    @InjectModel(Logistics)
    private readonly logisticsModel: typeof Logistics,
    @InjectModel(FreightQuote)
    private readonly quoteModel: typeof FreightQuote,
    @InjectModel(FreightChargeMaster)
    private readonly chargeMasterModel: typeof FreightChargeMaster,
    @InjectModel(FreightQuoteCharge)
    private readonly quoteChargeModel: typeof FreightQuoteCharge,
    @InjectModel(FreightQuoteContainerRate)
    private readonly containerRateModel: typeof FreightQuoteContainerRate,
    @InjectModel(LogisticsRoute)
    private readonly logisticsRouteModel: typeof LogisticsRoute,
    @InjectModel(Enquiry)
    private readonly enquiryModel: typeof Enquiry,
    @InjectModel(SalesContract)
    private readonly salesContractModel: typeof SalesContract,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(Attachment)
    private readonly attachmentModel: typeof Attachment,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(PartnerContact)
    private readonly partnerContactModel: typeof PartnerContact,
    private readonly attachmentsService: AttachmentsService,
    private readonly auditService: AuditService,
    private readonly sequelize: Sequelize,
  ) { }

  async fixDb() {
    try {
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "is_direct" BOOLEAN DEFAULT false;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "product_id" INTEGER;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "loading_point" VARCHAR(255);`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "destination" VARCHAR(255);`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ALTER COLUMN "logistics_id" DROP NOT NULL;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ALTER COLUMN "seller_id" DROP NOT NULL;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ALTER COLUMN "freight_amount" DROP NOT NULL;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ALTER COLUMN "transit_days" DROP NOT NULL;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ALTER COLUMN "validity_date" DROP NOT NULL;`,
      );

      await this.sequelize.models.FreightRoute.sync({ alter: true });
      await this.sequelize.models.FreightRate.sync({ alter: true });

      return { success: true, message: 'DB updated successfully!' };
    } catch (error) {
      console.error(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get confirmed enquiries for the logistics queue, joined with logistics workspace.
   */
  /**
   * Terminal logistics statuses — enquiries at these stages are done and
   * should no longer appear in the Transport Management queue.
   */
  private static readonly TERMINAL_LOGISTICS_STATUSES = [
    'Shipment Created',
    'Delivered',
    'Closed',
  ];

  async findQueue(query: QueryLogisticsDto, companyId: number = 1) {
    const { search, mode, status, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const company = (await this.sequelize.models.Company.findByPk(
      companyId,
    )) as any;
    const companyCountry = company?.country;

    // ── Base Enquiry Conditions ───────────────────────────────────────────────
    // Exclude cancelled enquiries (show NEW, PENDING, CONFIRMED, CLOSED, etc.)
    const whereConditions: any[] = [
      { status: { [Op.notIn]: ['CANCELLED'] } },
      { companyId },
      { freightRequired: true },
    ];

    // ── Mode Filter (case-insensitive, null-safe) ─────────────────────────────
    // Normalize company country — trim + lowercase for consistent comparison.
    // Op.iLike without wildcards = case-insensitive exact match in PostgreSQL.
    // Op.notILike = NOT ILIKE, case-insensitive inequality.
    const normCompanyCountry = companyCountry?.trim().toLowerCase() || null;

    if (normCompanyCountry && mode && mode !== 'All') {
      if (mode === 'Domestic') {
        // origin == company AND destination == company
        whereConditions.push({
          originCountryId: { [Op.iLike]: normCompanyCountry },
          destinationCountry: { [Op.iLike]: normCompanyCountry },
        });
      } else if (mode === 'Export') {
        // origin == company AND destination != company
        whereConditions.push({
          originCountryId: { [Op.iLike]: normCompanyCountry },
          destinationCountry: { [Op.notILike]: normCompanyCountry },
        });
      } else if (mode === 'Merchant Export') {
        // origin != company AND destination != company
        whereConditions.push({
          originCountryId: { [Op.notILike]: normCompanyCountry },
          destinationCountry: { [Op.notILike]: normCompanyCountry },
        });
      }
    }
    // mode === 'All' OR no companyCountry → no mode filter applied

    // ── Search Filter ─────────────────────────────────────────────────────────
    if (search && search.trim()) {
      const s = search.trim();
      whereConditions.push({
        [Op.or]: [
          { enquiryNo: { [Op.iLike]: `%${s}%` } },
          { '$partner.entity_name$': { [Op.iLike]: `%${s}%` } },
          { '$product.name$': { [Op.iLike]: `%${s}%` } },
        ],
      });
    }

    // ── Logistics Status Filter (Active vs Closed) ────────────────────────────
    const effectiveStatus = status || 'Active';
    const terminalStatuses = LogisticsService.TERMINAL_LOGISTICS_STATUSES;

    if (effectiveStatus === 'Closed') {
      whereConditions.push({
        '$logistics.status$': { [Op.in]: terminalStatuses },
      });
    } else if (effectiveStatus === 'Active') {
      whereConditions.push({
        [Op.or]: [
          { '$logistics.id$': null },
          { '$logistics.status$': { [Op.notIn]: terminalStatuses } },
        ],
      });
    }

    const whereEnquiry: any = { [Op.and]: whereConditions };

    const { rows, count } = await this.enquiryModel.findAndCountAll({
      where: whereEnquiry,
      include: [
        { model: Partner, as: 'partner', attributes: ['id', 'entityName'] },
        { model: Product, as: 'product', attributes: ['id', 'name'] },
        {
          model: EnquiryLoadingPoint,
          as: 'loadingPoints',
          attributes: ['loadingPoint'],
        },
        {
          model: EnquiryDestination,
          as: 'destinations',
          attributes: ['destination'],
        },
        {
          model: Logistics,
          as: 'logistics',
          required: effectiveStatus === 'Closed',
          include: [
            {
              model: FreightQuote,
              as: 'selectedFreight',
              required: false,
              include: [
                {
                  model: Partner,
                  as: 'seller',
                  attributes: ['id', 'entityName'],
                },
              ],
            },
          ],
        },
      ],
      distinct: true,
      subQuery: false,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Get ALL freight quotes across all logistics records — centralized repository view.
   */
  async getAllFreightQuotes(
    query: {
      search?: string;
      transportMode?: string;
      isPreferred?: boolean;
      status?: string;
      product?: string;
      origin?: string;
      destination?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortDir?: string;
    },
    companyId: number = 1,
  ) {
    const {
      search,
      transportMode,
      isPreferred,
      status,
      product,
      origin,
      destination,
      dateFrom,
      dateTo,
      page = 1,
      limit = 15,
      sortBy = 'createdAt',
      sortDir = 'DESC',
    } = query;

    const quoteWhereConditions: any[] = [{ companyId }];

    // ── 1. Preferred / Rejected / Status Filtering ─────────────────────────
    if (isPreferred !== undefined && isPreferred !== null) {
      quoteWhereConditions.push({ isPreferred });
    }

    if (status && status !== 'all') {
      const st = status.toLowerCase();
      if (st === 'preferred') {
        quoteWhereConditions.push({ isPreferred: true });
      } else if (st === 'rejected') {
        quoteWhereConditions.push({ isRejected: true });
      } else if (st === 'expired') {
        quoteWhereConditions.push({ validityDate: { [Op.lt]: new Date() } });
      } else if (st === 'active') {
        quoteWhereConditions.push({
          isPreferred: false,
          isRejected: false,
          [Op.or]: [
            { validityDate: null },
            { validityDate: { [Op.gte]: new Date() } },
          ],
        });
      } else if (st === 'draft') {
        quoteWhereConditions.push({ status: { [Op.iLike]: 'draft' } });
      } else if (st === 'submitted') {
        quoteWhereConditions.push({ status: { [Op.iLike]: 'submitted' } });
      }
    }

    // ── 2. Date Range Filtering (createdAt) ─────────────────────────────────
    if (dateFrom || dateTo) {
      const dateCond: any = {};
      if (dateFrom) {
        dateCond[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        dateCond[Op.lte] = toDate;
      }
      quoteWhereConditions.push({ createdAt: dateCond });
    }

    // ── 3. Database Search Filter ───────────────────────────────────────────
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      quoteWhereConditions.push({
        [Op.or]: [
          { quoteNumber: { [Op.iLike]: s } },
          { '$seller.entity_name$': { [Op.iLike]: s } },
          { '$logistics.enquiry.enquiry_no$': { [Op.iLike]: s } },
          { '$logistics.enquiry.product.name$': { [Op.iLike]: s } },
          { '$logistics.enquiry.origin_city$': { [Op.iLike]: s } },
          { '$logistics.enquiry.origin_port$': { [Op.iLike]: s } },
          { '$logistics.enquiry.destination_city$': { [Op.iLike]: s } },
          { '$logistics.enquiry.destination_port$': { [Op.iLike]: s } },
        ],
      });
    }

    const quoteWhere =
      quoteWhereConditions.length > 0 ? { [Op.and]: quoteWhereConditions } : {};

    // ── 4. Transport Mode Filter ────────────────────────────────────────────
    const logisticsWhere: any = {};
    if (transportMode && transportMode !== 'All') {
      logisticsWhere.transportMode = transportMode;
    }

    // ── 5. Origin & Destination Filters ─────────────────────────────────────
    if (origin && origin !== 'all') {
      const orig = `%${origin.trim()}%`;
      quoteWhereConditions.push({
        [Op.or]: [
          { '$logistics.enquiry.origin_city$': { [Op.iLike]: orig } },
          { '$logistics.enquiry.origin_port$': { [Op.iLike]: orig } },
          { '$logistics.enquiry.origin_state$': { [Op.iLike]: orig } },
          { loadingPoint: { [Op.iLike]: orig } },
          { '$freightRoutes.origin$': { [Op.iLike]: orig } },
        ],
      });
    }

    if (destination && destination !== 'all') {
      const dest = `%${destination.trim()}%`;
      quoteWhereConditions.push({
        [Op.or]: [
          { '$logistics.enquiry.destination_city$': { [Op.iLike]: dest } },
          { '$logistics.enquiry.destination_port$': { [Op.iLike]: dest } },
          { '$logistics.enquiry.destination_state$': { [Op.iLike]: dest } },
          { destination: { [Op.iLike]: dest } },
          { '$freightRoutes.destination$': { [Op.iLike]: dest } },
        ],
      });
    }

    // ── 6. Product Filter ───────────────────────────────────────────────────
    if (product && product !== 'all') {
      const prod = `%${product.trim()}%`;
      quoteWhereConditions.push({
        [Op.or]: [
          { '$logistics.enquiry.product.name$': { [Op.iLike]: prod } },
          { '$product.name$': { [Op.iLike]: prod } },
        ],
      });
    }

    // ── 7. Order Map ────────────────────────────────────────────────────────
    const orderMap: Record<string, string> = {
      freightAmount: 'freight_amount',
      transitDays: 'transit_days',
      validityDate: 'validity_date',
      createdAt: 'created_at',
    };
    const orderCol = orderMap[sortBy] || 'created_at';
    const orderDir =
      (sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // ── 8. Single SQL Query Execution ───────────────────────────────────────
    const { rows, count } = await this.quoteModel.findAndCountAll({
      where: quoteWhere,
      include: [
        { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
        { model: FreightQuoteCharge, as: 'charges' },
        {
          model: FreightQuoteContainerRate,
          as: 'containerRates',
          include: ['charges'],
        },
        {
          model: Logistics,
          as: 'logistics',
          where:
            Object.keys(logisticsWhere).length > 0 ? logisticsWhere : undefined,
          required: false,
          attributes: [
            'id',
            'logisticsNumber',
            'transportMode',
            'mode',
            'status',
          ],
          include: [
            {
              model: Enquiry,
              as: 'enquiry',
              where: { companyId },
              required: false,
              attributes: [
                'id',
                'enquiryNo',
                'originCity',
                'originState',
                'originPort',
                'destinationCity',
                'destinationState',
                'destinationPort',
                'originCountryId',
                'destinationCountry',
              ],
              include: [
                {
                  model: Product,
                  as: 'product',
                  required: false,
                  attributes: ['id', 'name'],
                },
              ],
            },
          ],
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name'],
        },
        {
          model: this.sequelize.models.FreightRoute,
          as: 'freightRoutes',
          include: [
            {
              model: this.sequelize.models.FreightRate,
              as: 'rates',
              include: ['partner'],
            },
          ],
        },
      ],
      order: [[orderCol, orderDir]],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
      distinct: true,
      subQuery: false,
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    };
  }

  /**
   * Get charge types master list (optionally filtered by shipment mode).
   */
  async getChargeMaster(mode?: string) {
    const where: any = { isActive: true };
    if (mode && mode.trim()) {
      where.mode = { [Op.iLike]: mode.trim() };
    }
    return this.chargeMasterModel.findAll({
      where,
      order: [
        ['displayOrder', 'ASC'],
        ['chargeName', 'ASC'],
      ],
    });
  }

  /**
   * Create a new custom charge type in Charge Master with duplicate name check per mode.
   */
  async createChargeMaster(dto: CreateChargeMasterDto) {
    const mode = dto.mode.trim();
    const chargeName = dto.chargeName.trim();

    // Check duplicate within same mode
    const existing = await this.chargeMasterModel.findOne({
      where: {
        mode: { [Op.iLike]: mode },
        chargeName: { [Op.iLike]: chargeName },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Charge type "${chargeName}" already exists for ${mode} transport.`,
      );
    }

    const chargeCode =
      dto.chargeCode?.trim().toUpperCase() ||
      chargeName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .substring(0, 15);

    return this.chargeMasterModel.create({
      mode,
      chargeName,
      chargeCode,
      displayOrder: dto.displayOrder ?? 99,
      isDefault: dto.isDefault ?? false,
      isActive: true,
    });
  }

  /**
   * Get detail logistics workspace of an enquiry.
   * Auto-creates the Logistics record if missing.
   */
  async getDetails(enquiryId: string, companyId: number = 1) {
    const enquiry = await this.enquiryModel.findOne({
      where: { id: enquiryId, companyId },
      include: [
        { model: Partner, as: 'partner' },
        { model: Product, as: 'product' },
        {
          model: EnquiryLoadingPoint,
          as: 'loadingPoints',
          attributes: ['loadingPoint'],
        },
        {
          model: EnquiryDestination,
          as: 'destinations',
          attributes: ['destination'],
        },
      ],
    });
    if (!enquiry) {
      throw new NotFoundException('Enquiry not found');
    }

    let logistics = await this.logisticsModel.findOne({
      where: { enquiryId },
      include: [
        {
          model: FreightQuote,
          as: 'quotes',
          include: [
            { model: Partner, as: 'seller' },
            { model: FreightQuoteCharge, as: 'charges' },
            {
              model: FreightQuoteContainerRate,
              as: 'containerRates',
              include: ['charges'],
            },
          ],
        },
        {
          model: FreightQuote,
          as: 'selectedFreight',
          include: [
            { model: Partner, as: 'seller' },
            { model: FreightQuoteCharge, as: 'charges' },
            {
              model: FreightQuoteContainerRate,
              as: 'containerRates',
              include: ['charges'],
            },
          ],
        },
        {
          model: LogisticsRoute,
          as: 'routes',
        },
      ],
      order: [[{ model: FreightQuote, as: 'quotes' }, 'createdAt', 'DESC']],
    });

    // Auto-create workspace if it doesn't exist
    if (!logistics) {
      logistics = await this.sequelize.transaction(async (transaction) => {
        // Generate LOG/YYYY/###### number via sequence
        await this.sequelize.query(
          `CREATE SEQUENCE IF NOT EXISTS logistics_no_seq START 1;`,
          { transaction },
        );
        const [seqRes]: any = await this.sequelize.query(
          `SELECT nextval('logistics_no_seq')`,
          { type: QueryTypes.SELECT, transaction } as any,
        );
        const nextVal = parseInt(
          seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
          10,
        );
        const currentYear = new Date().getFullYear();
        const logisticsNumber = `LOG/${currentYear}/${String(nextVal).padStart(6, '0')}`;

        // Infer Mode & Transport Mode
        const mode =
          enquiry.shipmentMode === 'SHIP' ? 'International' : 'Domestic';
        let transportMode = 'Road';
        if (enquiry.shipmentMode === 'SHIP') transportMode = 'Sea';
        else if (enquiry.shipmentMode === 'RAIL') transportMode = 'Rail';

        const createdLogistics = await this.logisticsModel.create(
          {
            logisticsNumber,
            enquiryId,
            mode,
            transportMode,
            status: 'Pending',
          },
          { transaction },
        );

        // Audit log
        await this.auditService.writeLog({
          clientId: null,
          companyId,
          userId: null,
          entityType: 'Logistics',
          entityId: createdLogistics.id,
          action: 'LOGISTICS_CREATED',
          newValue: { logisticsNumber, mode, transportMode },
        });

        return createdLogistics;
      });

      // Reload with relationships
      logistics = await this.logisticsModel.findByPk(logistics.id, {
        include: [
          {
            model: FreightQuote,
            as: 'quotes',
            include: [
              { model: Partner, as: 'seller' },
              { model: FreightQuoteCharge, as: 'charges' },
              {
                model: FreightQuoteContainerRate,
                as: 'containerRates',
                include: ['charges'],
              },
            ],
          },
          {
            model: FreightQuote,
            as: 'selectedFreight',
            include: [
              { model: Partner, as: 'seller' },
              { model: FreightQuoteCharge, as: 'charges' },
              {
                model: FreightQuoteContainerRate,
                as: 'containerRates',
                include: ['charges'],
              },
            ],
          },
        ],
      });
    }

    // -- Auto-sync Logistics Routes --
    const origins = enquiry.loadingPoints?.map((l) => l.loadingPoint) || [];
    const destinations = enquiry.destinations?.map((d) => d.destination) || [];
    const expectedRoutes = [];
    if (origins.length > 0 && destinations.length > 0) {
      for (const origin of origins) {
        for (const destination of destinations) {
          expectedRoutes.push({ origin, destination });
        }
      }
    } else {
      const o =
        enquiry.originPort ||
        (enquiry.originCity
          ? `${enquiry.originCity}${enquiry.originState ? `, ${enquiry.originState}` : ''}`
          : 'Unknown Origin');
      const d =
        enquiry.destinationPort ||
        (enquiry.destinationCity
          ? `${enquiry.destinationCity}${enquiry.destinationState ? `, ${enquiry.destinationState}` : ''}`
          : 'Unknown Destination');
      expectedRoutes.push({ origin: o, destination: d });
    }

    const existingRoutes = await this.logisticsRouteModel.findAll({
      where: { logisticsId: logistics.id },
    });
    const finalRoutes = [];
    const expectedRouteKeys = new Set(
      expectedRoutes.map((r) => `${r.origin}:::${r.destination}`),
    );

    for (const er of expectedRoutes) {
      const exists = existingRoutes.find(
        (r) => r.origin === er.origin && r.destination === er.destination,
      );
      if (!exists) {
        const newRoute = await this.logisticsRouteModel.create({
          logisticsId: logistics.id,
          origin: er.origin,
          destination: er.destination,
        });
        finalRoutes.push(newRoute);
      } else {
        finalRoutes.push(exists);
      }
    }

    for (const r of existingRoutes) {
      if (!expectedRouteKeys.has(`${r.origin}:::${r.destination}`)) {
        const quotesCount = await this.quoteModel.count({
          where: { routeId: r.id },
        });
        if (quotesCount === 0) {
          await r.destroy();
        } else {
          finalRoutes.push(r);
        }
      }
    }

    // Attach routes to response
    logistics.setDataValue('routes', finalRoutes);

    // Look up if a SalesContract exists for this enquiry
    const salesContract = await this.salesContractModel.findOne({
      where: { enquiryId },
      attributes: ['id', 'contractNumber'],
    });

    // Mark as viewed if it hasn't been viewed yet
    if (!logistics.isViewed) {
      await logistics.update({ isViewed: true });
    }

    // Look up if a shipment has already been generated
    let shipmentId: number | null = null;
    if (salesContract) {
      const shipment = await this.shipmentModel.findOne({
        where: { salesContractId: salesContract.id, logisticsId: logistics.id },
        attributes: ['id'],
      });
      if (shipment) {
        shipmentId = shipment.id;
      }
    }

    return {
      enquiry,
      logistics,
      salesContractId: salesContract ? salesContract.id : null,
      salesContractNumber: salesContract ? salesContract.contractNumber : null,
      shipmentId,
    };
  }

  /**
   * Create a new freight quote under a logistics workspace.
   */
  async createFreightQuote(
    logisticsId: number,
    dto: CreateFreightQuoteDto,
    user: any,
    companyId: number = 1,
  ) {
    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    if (dto.sellerId) {
      const seller = await Partner.findOne({ where: { id: dto.sellerId, companyId } });
      if (!seller) throw new BadRequestException('Seller not found or does not belong to company');
    }

    return await this.sequelize.transaction(async (transaction) => {
      // Calculate overall freight amount from containerRates or legacy charges
      let calculatedFreightAmount = dto.freightAmount || 0;
      if (dto.containerRates && dto.containerRates.length > 0) {
        calculatedFreightAmount = 0;
        for (const cr of dto.containerRates) {
          if (cr.charges && cr.charges.length > 0) {
            const crSum = cr.charges.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            );
            calculatedFreightAmount += crSum;
          }
        }
      } else if (dto.charges && dto.charges.length > 0) {
        calculatedFreightAmount = dto.charges.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0,
        );
      } else if (!dto.freightAmount || dto.freightAmount <= 0) {
        throw new BadRequestException(
          'At least one freight charge or container rate is required.',
        );
      }

      // Generate FQ/YYYY/###### number via sequence
      await this.sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS freight_quotes_no_seq START 1;`,
        { transaction },
      );
      const [seqRes]: any = await this.sequelize.query(
        `SELECT nextval('freight_quotes_no_seq')`,
        { type: QueryTypes.SELECT, transaction } as any,
      );
      const nextVal = parseInt(
        seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
        10,
      );
      const currentYear = new Date().getFullYear();
      const quoteNumber = `FQ/${currentYear}/${String(nextVal).padStart(6, '0')}`;

      const quote = await this.quoteModel.create(
        {
          ...dto,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
          quoteNumber,
          logisticsId,
          createdBy: user?.userId,
          routeId: dto.routeId || null,
        } as any,
        { transaction },
      );

      // Persist container rates and their charges
      if (dto.containerRates && dto.containerRates.length > 0) {
        for (const cr of dto.containerRates) {
          const crSum =
            cr.charges?.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            ) || 0;
          const createdCr = await this.containerRateModel.create(
            {
              quoteId: quote.id,
              containerType: cr.containerType,
              containerSize: cr.containerSize,
              freightAmount: crSum,
            },
            { transaction },
          );

          if (cr.charges && cr.charges.length > 0) {
            const chargeRows = cr.charges.map((c, idx) => ({
              quoteId: quote.id,
              containerRateId: createdCr.id,
              chargeMasterId: c.chargeMasterId || null,
              chargeName: c.chargeName,
              amount: c.amount,
              remarks: c.remarks || null,
              displayOrder: c.displayOrder ?? idx + 1,
            }));
            await this.quoteChargeModel.bulkCreate(chargeRows, {
              transaction,
            });
          }
        }
      } else if (dto.charges && dto.charges.length > 0) {
        // Legacy flat charges support
        const chargeRows = dto.charges.map((c, idx) => ({
          quoteId: quote.id,
          containerRateId: null,
          chargeMasterId: c.chargeMasterId || null,
          chargeName: c.chargeName,
          amount: c.amount,
          remarks: c.remarks || null,
          displayOrder: c.displayOrder ?? idx + 1,
        }));
        await this.quoteChargeModel.bulkCreate(chargeRows, {
          transaction,
        });
      }

      // Auto-sync manual contact to Partner Master if provided
      await this.syncContactToPartner(
        dto.sellerId,
        dto.contactPerson,
        dto.contactNumber,
        transaction,
      );

      // Auto transition logistics status to Quotes Received if Pending
      if (logistics.status === 'Pending') {
        await logistics.update({ status: 'Quotes Received' }, { transaction });

        await this.auditService.writeLog({
          clientId: null,
          companyId,
          userId: user?.userId,
          entityType: 'Logistics',
          entityId: logistics.id,
          action: 'STATUS_CHANGED',
          oldValue: 'Pending',
          newValue: {
            status: 'Quotes Received',
            remarks: 'System updated status upon first quote entry',
          },
        });
      }

      // Log Quote added
      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logistics.id,
        action: 'QUOTE_ADDED',
        newValue: {
          quoteNumber,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
        },
      });

      return this.quoteModel.findByPk(quote.id, {
        include: [
          { model: Partner, as: 'seller' },
          {
            model: FreightQuoteContainerRate,
            as: 'containerRates',
            include: ['charges'],
          },
          { model: FreightQuoteCharge, as: 'charges' },
        ],
        transaction,
      });
    });
  }

  async createDirectFreightQuote(dto: CreateFreightQuoteDto, user: any, companyId: number = 1) {
    if (dto.sellerId) {
      const seller = await Partner.findOne({ where: { id: dto.sellerId, companyId } });
      if (!seller) throw new BadRequestException('Seller not found or does not belong to company');
    }

    return await this.sequelize.transaction(async (transaction) => {
      let calculatedFreightAmount = dto.freightAmount || 0;

      const hasRoutes = dto.freightRoutes && dto.freightRoutes.length > 0;

      if (!hasRoutes) {
        if (dto.containerRates && dto.containerRates.length > 0) {
          calculatedFreightAmount = 0;
          for (const cr of dto.containerRates) {
            if (cr.charges && cr.charges.length > 0) {
              const crSum = cr.charges.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0,
              );
              calculatedFreightAmount += crSum;
            }
          }
        } else if (dto.charges && dto.charges.length > 0) {
          calculatedFreightAmount = dto.charges.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
          );
        } else if (!dto.freightAmount || dto.freightAmount <= 0) {
          throw new BadRequestException(
            'At least one freight charge, container rate, or route rate is required.',
          );
        }
      }

      await this.sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS freight_quotes_no_seq START 1;`,
        { transaction },
      );
      const [seqRes]: any = await this.sequelize.query(
        `SELECT nextval('freight_quotes_no_seq')`,
        { type: QueryTypes.SELECT, transaction } as any,
      );
      const nextVal = parseInt(
        seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
        10,
      );
      const currentYear = new Date().getFullYear();
      const quoteNumber = `FQ/${currentYear}/${String(nextVal).padStart(6, '0')}`;

      const quote = await this.quoteModel.create(
        {
          ...dto,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
          quoteNumber,
          isDirect: true,
          companyId,
          createdBy: user?.userId,
        } as any,
        { transaction },
      );

      if (hasRoutes) {
        for (const routeDto of dto.freightRoutes) {
          const route = await this.sequelize.models.FreightRoute.create(
            {
              quoteId: quote.id,
              origin: routeDto.origin,
              destination: routeDto.destination,
            } as any,
            { transaction },
          );

          if (routeDto.rates && routeDto.rates.length > 0) {
            const rateRows = routeDto.rates.map((r) => ({
              routeId: (route as any).id,
              partnerId: r.partnerId,
              equipment: r.equipment || null,
              transitDays: r.transitDays || 0,
              currency: r.currency || 'INR',
              amount: r.amount,
              validTill: r.validTill || null,
              status: r.status || 'Active',
            }));
            await this.sequelize.models.FreightRate.bulkCreate(
              rateRows as any,
              { transaction },
            );
          }
        }
      } else {
        if (dto.containerRates && dto.containerRates.length > 0) {
          for (const cr of dto.containerRates) {
            const crSum =
              cr.charges?.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0,
              ) || 0;
            const createdCr = await this.containerRateModel.create(
              {
                quoteId: quote.id,
                containerType: cr.containerType,
                containerSize: cr.containerSize,
                freightAmount: crSum,
              },
              { transaction },
            );

            if (cr.charges && cr.charges.length > 0) {
              const chargeRows = cr.charges.map((c, idx) => ({
                quoteId: quote.id,
                containerRateId: createdCr.id,
                chargeMasterId: c.chargeMasterId || null,
                chargeName: c.chargeName,
                amount: c.amount,
                remarks: c.remarks || null,
                displayOrder: c.displayOrder ?? idx + 1,
              }));
              await this.quoteChargeModel.bulkCreate(chargeRows, {
                transaction,
              });
            }
          }
        } else if (dto.charges && dto.charges.length > 0) {
          const chargeRows = dto.charges.map((c, idx) => ({
            quoteId: quote.id,
            containerRateId: null,
            chargeMasterId: c.chargeMasterId || null,
            chargeName: c.chargeName,
            amount: c.amount,
            remarks: c.remarks || null,
            displayOrder: c.displayOrder ?? idx + 1,
          }));
          await this.quoteChargeModel.bulkCreate(chargeRows, {
            transaction,
          });
        }
      }

      await this.syncContactToPartner(
        dto.sellerId,
        dto.contactPerson,
        dto.contactNumber,
        transaction,
      );

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'FreightQuote',
        entityId: quote.id,
        action: 'DIRECT_QUOTE_ADDED',
        newValue: {
          quoteNumber,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
        },
      });

      return this.quoteModel.findByPk(quote.id, {
        include: [
          { model: Partner, as: 'seller' },
          {
            model: FreightQuoteContainerRate,
            as: 'containerRates',
            include: ['charges'],
          },
          { model: FreightQuoteCharge, as: 'charges' },
          { model: Product, as: 'product' },
          {
            model: this.sequelize.models.FreightRoute,
            as: 'freightRoutes',
            include: [
              {
                model: this.sequelize.models.FreightRate,
                as: 'rates',
                include: ['partner'],
              },
            ],
          },
        ],
        transaction,
      });
    });
  }

  async deleteDirectFreightQuote(quoteId: number, user: any, companyId: number = 1) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, isDirect: true },
    });
    if (!quote) {
      throw new NotFoundException('Direct freight quote not found');
    }

    if (quote.isPreferred) {
      throw new BadRequestException(
        'Cannot delete preferred quote.'
      );
    }

    await this.sequelize.transaction(async (transaction) => {
      await quote.destroy({ transaction });

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'FreightQuote',
        entityId: quoteId,
        action: 'DIRECT_QUOTE_DELETED',
        oldValue: { quoteNumber: quote.quoteNumber },
      });
    });

    return { success: true };
  }

  async updateDirectFreightQuote(
    quoteId: number,
    dto: CreateFreightQuoteDto,
    user: any,
    companyId: number = 1,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, isDirect: true },
    });
    if (!quote) throw new NotFoundException('Direct freight quote not found');

    return await this.sequelize.transaction(async (transaction) => {
      // 1. Update quote basic details
      await quote.update(
        {
          productId: dto.productId,
          quoteDate: dto.quoteDate,
          updatedBy: user?.userId,
        } as any,
        { transaction },
      );

      // 2. Clear old routes and rates
      const oldRoutes = await this.sequelize.models.FreightRoute.findAll({
        where: { quoteId: quote.id },
        transaction,
      });
      const oldRouteIds = oldRoutes.map((r) => (r as any).id);
      if (oldRouteIds.length > 0) {
        await this.sequelize.models.FreightRate.destroy({
          where: { routeId: oldRouteIds },
          transaction,
        });
        await this.sequelize.models.FreightRoute.destroy({
          where: { quoteId: quote.id },
          transaction,
        });
      }

      // 3. Re-create routes and rates
      if (dto.freightRoutes && dto.freightRoutes.length > 0) {
        for (const routeDto of dto.freightRoutes) {
          const route = await this.sequelize.models.FreightRoute.create(
            {
              quoteId: quote.id,
              origin: routeDto.origin,
              destination: routeDto.destination,
            } as any,
            { transaction },
          );

          if (routeDto.rates && routeDto.rates.length > 0) {
            const rateRows = routeDto.rates.map((r) => ({
              routeId: (route as any).id,
              partnerId: r.partnerId,
              equipment: r.equipment || null,
              transitDays: r.transitDays || 0,
              currency: r.currency || 'INR',
              amount: r.amount,
              validTill: r.validTill || null,
              status: r.status || 'Active',
            }));
            await this.sequelize.models.FreightRate.bulkCreate(
              rateRows as any,
              { transaction },
            );
          }
        }
      }

      // Increment version placeholder
      const newVersion = (quote.version || 1) + 1;
      await quote.update({ version: newVersion }, { transaction });

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'FreightQuote',
        entityId: quote.id,
        action: 'DIRECT_QUOTE_EDITED',
        newValue: { quoteNumber: quote.quoteNumber, version: newVersion },
      });

      return this.quoteModel.findByPk(quote.id, {
        include: [
          { model: Product, as: 'product' },
          {
            model: this.sequelize.models.FreightRoute,
            as: 'freightRoutes',
            include: [
              {
                model: this.sequelize.models.FreightRate,
                as: 'rates',
                include: ['partner'],
              },
            ],
          },
        ],
        transaction,
      });
    });
  }

  /**
   * Edit a freight quote.
   */
  async updateFreightQuote(
    logisticsId: number,
    quoteId: number,
    dto: CreateFreightQuoteDto,
    user: any,
    companyId: number = 1,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    if (dto.sellerId) {
      const seller = await Partner.findOne({
        where: { id: dto.sellerId, companyId },
      });
      if (!seller)
        throw new BadRequestException(
          'Seller not found or does not belong to company',
        );
    }

    await this.sequelize.transaction(async (transaction) => {
      // Calculate overall freight amount from containerRates or legacy charges
      let calculatedFreightAmount = dto.freightAmount || 0;
      if (dto.containerRates && dto.containerRates.length > 0) {
        calculatedFreightAmount = 0;
        for (const cr of dto.containerRates) {
          if (cr.charges && cr.charges.length > 0) {
            const crSum = cr.charges.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            );
            calculatedFreightAmount += crSum;
          }
        }
      } else if (dto.charges && dto.charges.length > 0) {
        calculatedFreightAmount = dto.charges.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0,
        );
      } else if (!dto.freightAmount || dto.freightAmount <= 0) {
        throw new BadRequestException(
          'At least one freight charge or container rate is required.',
        );
      }

      // Increment version placeholder
      const newVersion = (quote.version || 1) + 1;

      await quote.update(
        {
          ...dto,
          freightAmount: calculatedFreightAmount,
          version: newVersion,
          updatedBy: user?.userId,
          routeId: dto.routeId || null,
        } as any,
        { transaction },
      );

      // Re-create charges and container rates line items
      await this.quoteChargeModel.destroy({
        where: { quoteId: quote.id },
        transaction,
      });
      await this.containerRateModel.destroy({
        where: { quoteId: quote.id },
        transaction,
      });

      if (dto.containerRates && dto.containerRates.length > 0) {
        for (const cr of dto.containerRates) {
          const crSum =
            cr.charges?.reduce(
              (sum, item) => sum + Number(item.amount || 0),
              0,
            ) || 0;
          const createdCr = await this.containerRateModel.create(
            {
              quoteId: quote.id,
              containerType: cr.containerType,
              containerSize: cr.containerSize,
              freightAmount: crSum,
            },
            { transaction },
          );

          if (cr.charges && cr.charges.length > 0) {
            const chargeRows = cr.charges.map((c, idx) => ({
              quoteId: quote.id,
              containerRateId: createdCr.id,
              chargeMasterId: c.chargeMasterId || null,
              chargeName: c.chargeName,
              amount: c.amount,
              remarks: c.remarks || null,
              displayOrder: c.displayOrder ?? idx + 1,
            }));
            await this.quoteChargeModel.bulkCreate(chargeRows, {
              transaction,
            });
          }
        }
      } else if (dto.charges && dto.charges.length > 0) {
        const chargeRows = dto.charges.map((c, idx) => ({
          quoteId: quote.id,
          containerRateId: null,
          chargeMasterId: c.chargeMasterId || null,
          chargeName: c.chargeName,
          amount: c.amount,
          remarks: c.remarks || null,
          displayOrder: c.displayOrder ?? idx + 1,
        }));
        await this.quoteChargeModel.bulkCreate(chargeRows, {
          transaction,
        });
      }

      // Auto-sync manual contact to Partner Master if provided
      await this.syncContactToPartner(
        dto.sellerId,
        dto.contactPerson,
        dto.contactNumber,
        transaction,
      );

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'QUOTE_EDITED',
        newValue: { quoteNumber: quote.quoteNumber, version: newVersion },
      });
    });

    return quote.reload({
      include: [
        { model: Partner, as: 'seller' },
        {
          model: FreightQuoteContainerRate,
          as: 'containerRates',
          include: ['charges'],
        },
        { model: FreightQuoteCharge, as: 'charges' },
      ],
    });
  }

  /**
   * Auto-sync manual contact person to Partner Master (partner_contacts table)
   */
  private async syncContactToPartner(
    sellerId?: number,
    contactPerson?: string,
    contactNumber?: string,
    transaction?: any,
  ) {
    if (!sellerId || !contactPerson || !contactPerson.trim()) return;
    try {
      const sId = Number(sellerId);
      const contactName = contactPerson.trim();
      const phone = contactNumber ? contactNumber.trim() : null;

      const existingContacts = await this.partnerContactModel.findAll({
        where: { partnerId: sId },
        transaction,
      });

      const exists = existingContacts.some(
        (c) => c.name?.toLowerCase().trim() === contactName.toLowerCase(),
      );

      if (!exists) {
        await this.partnerContactModel.create(
          {
            partnerId: sId,
            name: contactName,
            phone: phone,
            isPrimary: existingContacts.length === 0,
          },
          { transaction },
        );
      }
    } catch (e) {
      console.error('[LogisticsService] Contact Auto-Sync Error:', e);
    }
  }

  /**
   * Delete a freight quote (restricted if preferred).
   */
  async deleteFreightQuote(
    logisticsId: number,
    quoteId: number,
    user: any,
    companyId: number = 1,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    if (quote.isPreferred) {
      throw new BadRequestException(
        'Cannot delete preferred quote. Please mark another quote as preferred or clear preferred selection first.',
      );
    }

    await this.sequelize.transaction(async (transaction) => {
      await quote.destroy({ transaction });

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'QUOTE_DELETED',
        oldValue: { quoteNumber: quote.quoteNumber },
      });
    });

    return { success: true };
  }

  /**
   * Set preferred quote lock logic.
   */
  async setPreferredQuote(
    logisticsId: number,
    quoteId: number,
    user: any,
    companyId: number = 1,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    await this.sequelize.transaction(async (transaction) => {
      // 1. Mark this quote as preferred, others on the same route as rejected
      const routeCondition = quote.routeId ? { routeId: quote.routeId } : {};

      await this.quoteModel.update(
        { isPreferred: false, isRejected: true },
        { where: { logisticsId, ...routeCondition }, transaction },
      );

      await quote.update(
        { isPreferred: true, isRejected: false },
        { transaction },
      );

      // 2. Link selected quote and update Logistics status to Preferred Quote Selected
      const oldStatus = logistics.status;
      await logistics.update(
        {
          selectedFreightId: quote.id,
          status: 'Preferred Quote Selected',
          updatedBy: user?.userId,
        },
        { transaction },
      );

      // 3. Log actions
      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'PREFERRED_CHANGED',
        newValue: { quoteNumber: quote.quoteNumber },
      });

      if (oldStatus !== 'Preferred Quote Selected') {
        await this.auditService.writeLog({
          clientId: null,
          companyId,
          userId: user?.userId,
          entityType: 'Logistics',
          entityId: logisticsId,
          action: 'STATUS_CHANGED',
          oldValue: oldStatus,
          newValue: 'Preferred Quote Selected',
        });
      }
    });

    return this.logisticsModel.findByPk(logisticsId, {
      include: [
        { model: FreightQuote, as: 'quotes' },
        { model: FreightQuote, as: 'selectedFreight' },
      ],
    });
  }

  /**
   * Update header details manually (estimated dates, remarks, transportMode).
   */
  async updateStatus(
    logisticsId: number,
    dto: UpdateLogisticsStatusDto,
    user: any,
    companyId: number = 1,
  ) {
    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    await this.sequelize.transaction(async (transaction) => {
      const oldStatus = logistics.status;
      const updates: any = { ...dto, updatedBy: user?.userId };

      await logistics.update(updates, { transaction });

      if (dto.status && oldStatus !== dto.status) {
        await this.auditService.writeLog({
          clientId: null,
          companyId,
          userId: user?.userId,
          entityType: 'Logistics',
          entityId: logisticsId,
          action: 'STATUS_CHANGED',
          oldValue: oldStatus,
          newValue: { status: dto.status, remarks: dto.remarks || null },
        });
      }
    });

    return logistics.reload();
  }

  /**
   * Generate shipment linked to this logistics workspace.
   */
  async generateShipment(
    logisticsId: number,
    user: any,
    companyId: number = 1,
  ) {
    const logistics = await this.logisticsModel.findByPk(logisticsId, {
      include: [
        { model: Enquiry, as: 'enquiry' },
        { model: FreightQuote, as: 'selectedFreight' },
      ],
    });

    if (!logistics) {
      throw new NotFoundException('Logistics workspace not found');
    }

    if (!logistics.selectedFreightId || !logistics.selectedFreight) {
      throw new BadRequestException(
        'Please select a preferred freight quote before generating shipment.',
      );
    }

    // Lookup Sales Contract linked via ForeignKey enquiryId
    const salesContract = await this.salesContractModel.findOne({
      where: { enquiryId: logistics.enquiryId },
      include: [{ model: SalesContractShipment }],
    });

    if (!salesContract) {
      throw new BadRequestException(
        'No executed Sales Contract found for this enquiry. Please execute the Sales Contract first.',
      );
    }

    // Verify if shipment is already generated
    const existingShipment = await this.shipmentModel.findOne({
      where: { salesContractId: salesContract.id, logisticsId: logistics.id },
    });
    if (existingShipment) {
      throw new BadRequestException(
        'A shipment has already been generated for this logistics workspace.',
      );
    }

    return await this.sequelize.transaction(async (transaction) => {
      const quote = logistics.selectedFreight;
      const shipmentNo = (salesContract.shipments?.length || 0) + 1;

      // Extract shipment details from preferred quote
      const shipmentDate =
        logistics.estimatedDispatchDate || quote.etd || new Date();
      const quantity = logistics.enquiry.quantity || 0;

      // Calculate totalAmount runtime getter value
      const freightCost = quote.totalAmount;

      // Create new SalesContractShipment
      const shipment = await this.shipmentModel.create(
        {
          salesContractId: salesContract.id,
          logisticsId: logistics.id,
          shipmentDate,
          quantity,
          ratePerMt: 0,
          purchaseRate: 0,
          forex: 1,
          freight: freightCost,
          remarks: `Generated from Logistics ${logistics.logisticsNumber} with Preferred Quote ${quote.quoteNumber}`,
          shipmentNo,
          shipmentReference: logistics.logisticsNumber,
          status: 'Scheduled',
        },
        { transaction },
      );

      // Advance logistics status to Shipment Created
      const oldStatus = logistics.status;
      await logistics.update({ status: 'Shipment Created' }, { transaction });

      // Write timelines logs
      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logistics.id,
        action: 'SHIPMENT_GENERATED',
        newValue: {
          shipmentId: shipment.id,
          shipmentNo,
          shipmentReference: logistics.logisticsNumber,
        },
      });

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logistics.id,
        action: 'STATUS_CHANGED',
        oldValue: oldStatus,
        newValue: 'Shipment Created',
      });

      return shipment;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POLYMORPHIC ATTACHMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  async getAttachments(logisticsId: number) {
    const attachments = await this.attachmentModel.findAll({
      where: { entityType: 'LOGISTICS', entityId: logisticsId },
      order: [['createdAt', 'DESC']],
    });

    return attachments.map((att) => ({
      id: att.id,
      fileName: att.originalName,
      fileSize: att.fileSize,
      mimeType: att.mimeType,
      downloadUrl: `/attachments/${att.id}/download`,
      createdAt: att.createdAt,
    }));
  }

  async uploadAttachment(
    logisticsId: number,
    category: string,
    file: Express.Multer.File,
    user: any,
    companyId: number = 1,
  ) {
    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    return await this.sequelize.transaction(async (transaction) => {
      // 1. Create central attachment row via central engine
      const attachment = await this.attachmentsService.createAttachment(
        file,
        user?.userId,
        companyId,
      );

      // 2. Update attachment to link polymorphically
      await attachment.update(
        {
          entityType: 'LOGISTICS',
          entityId: logisticsId,
          // Storing category in fileName or remarks if category is not explicitly supported,
          // but wait! Attachments has category in some legacy models. Here we can store it in originalName as metadata or prefix it,
          // or since attachments table doesn't have a category field, we can prefix the originalName with `[Category] `,
          // or just write it. Prefixing originalName with category (e.g. "Rate Sheet - invoice.pdf") makes it visually explicit!
          originalName: category
            ? `${category} - ${file.originalname}`
            : file.originalname,
        },
        { transaction },
      );

      // 3. Log event
      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'ATTACHMENT_UPLOADED',
        newValue: {
          attachmentId: attachment.id,
          category,
          fileName: attachment.originalName,
        },
      });

      return {
        id: attachment.id,
        fileName: attachment.originalName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        downloadUrl: `/attachments/${attachment.id}/download`,
        createdAt: attachment.createdAt,
      };
    });
  }

  async deleteAttachment(
    logisticsId: number,
    attachmentId: number,
    user: any,
    companyId: number = 1,
  ) {
    const attachment = await this.attachmentModel.findOne({
      where: {
        id: attachmentId,
        entityType: 'LOGISTICS',
        entityId: logisticsId,
      },
    });
    if (!attachment) {
      throw new NotFoundException(
        'Attachment not found under this logistics workspace',
      );
    }

    await this.sequelize.transaction(async (transaction) => {
      // Delete physical file & DB row
      await this.attachmentsService.deleteAttachment(attachmentId);

      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'QUOTE_DELETED', // Reusing quote deleted action or custom
        oldValue: { attachmentId, fileName: attachment.originalName },
      });
    });

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPERATIONAL LOG TRAIL
  // ─────────────────────────────────────────────────────────────────────────────

  async getActivities(logisticsId: number) {
    const logs = await this.auditService.getLogs({
      entityType: 'Logistics',
    });

    // Filter by entityId since getLogs only supports client-level filter, or we filter manually
    const filteredLogs = logs.filter((l) => l.entityId === logisticsId);

    // Format logs for frontend timeline display
    return filteredLogs.map((log) => ({
      id: log.id,
      action: log.action,
      description: this.formatActionDescription(log),
      metadata: log.newValue || log.oldValue || {},
      performedBy: log.userId,
      performedByName: log.user ? log.user.name : 'System',
      createdAt: log.createdAt,
    }));
  }

  private formatActionDescription(log: any): string {
    switch (log.action) {
      case 'LOGISTICS_CREATED':
        return `Logistics workspace initialized (${log.newValue?.logisticsNumber || ''})`;
      case 'QUOTE_ADDED':
        return `Freight Quote "${log.newValue?.quoteNumber || ''}" added`;
      case 'QUOTE_EDITED':
        return `Freight Quote "${log.newValue?.quoteNumber || ''}" revised to Version ${log.newValue?.version || '2'}`;
      case 'QUOTE_DELETED':
        return `Freight Quote "${log.oldValue?.quoteNumber || ''}" deleted`;
      case 'PREFERRED_CHANGED':
        return `Freight Quote "${log.newValue?.quoteNumber || ''}" set as Preferred Quote`;
      case 'SHIPMENT_GENERATED':
        return `Shipment #${log.newValue?.shipmentNo || '1'} generated under Sales Contract`;
      case 'ATTACHMENT_UPLOADED':
        return `Document "${log.newValue?.fileName || ''}" uploaded`;
      case 'STATUS_CHANGED':
        return `Status advanced from "${log.oldValue || 'Pending'}" to "${log.newValue || 'Pending'}"`;
      default:
        return log.action;
    }
  }
}
