import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { FindOptions, Op, Order, QueryTypes } from 'sequelize';

import { Logistics } from '../models/logistics.model';
import { FreightQuote } from '../models/freight-quote.model';
import { FreightChargeMaster } from '../models/freight-charge-master.model';
import { FreightQuoteCharge } from '../models/freight-quote-charge.model';
import { FreightQuoteContainerRate } from '../models/freight-quote-container-rate.model';
import { LogisticsRoute } from '../models/logistics-route.model';
import { Enquiry } from '../../enquiries/models/enquiry.model';
import { TransportDetail } from '../../enquiries/models/transport-detail.model';
import {
  evaluateFreightRequired,
  extractIncotermCode,
} from '../../masters/shipment-type/freight-rule-engine.service';
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
import { ShipmentService } from '../../sales-contracts/shipment.service';
import { ShipmentReadinessService } from '../../sales-contracts/services/shipment-readiness.service';

import { QueryLogisticsDto } from '../dto/query-logistics.dto';
import { BusinessTransaction } from '../../system/models/business-transaction.model';
import {
  isBusinessReferenceSearch,
  resolveBusinessTransactionId,
} from '../../system/utils/business-reference-query.util';
import { CreateFreightQuoteDto } from '../dto/create-freight-quote.dto';
import { CreateChargeMasterDto } from '../dto/create-charge-master.dto';
import { UpdateLogisticsStatusDto } from '../dto/update-logistics-status.dto';

import { PartnerContact } from '../../masters/partner/partner-contact.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { Company } from '../../companies/models/company.model';
import { TransportEnquiryHidden } from '../models/transport-enquiry-hidden.model';
import { formatLogisticsLocation } from '../utils/logistics-location.util';
import { isTransportAllocationComplete } from '../utils/transport-allocation.util';

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
    @InjectModel(TransportEnquiryHidden)
    private readonly transportEnquiryHiddenModel: typeof TransportEnquiryHidden,
    private readonly attachmentsService: AttachmentsService,
    private readonly auditService: AuditService,
    private readonly sequelize: Sequelize,
    @Inject(forwardRef(() => ShipmentService))
    private readonly shipmentService: ShipmentService,
    @Inject(forwardRef(() => ShipmentReadinessService))
    private readonly readinessService: ShipmentReadinessService,
    @Optional()
    @InjectModel(PaymentTerm)
    private readonly paymentTermModel?: typeof PaymentTerm,
  ) { }

  private async resolvePaymentTerm(
    paymentTermId?: number,
    paymentTermsText?: string,
    user?: any,
    companyId?: number,
  ): Promise<{ paymentTermId: number | null; paymentTerms: string | null }> {
    const termModel = this.paymentTermModel || PaymentTerm;
    if (paymentTermId) {
      const pt = await termModel.findByPk(paymentTermId);
      if (pt) {
        return { paymentTermId: pt.id, paymentTerms: pt.name };
      }
    }
    if (paymentTermsText && paymentTermsText.trim()) {
      const trimmed = paymentTermsText.trim();
      const pt = await termModel.findOne({
        where: Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('name'))),
          trimmed.toLowerCase(),
        ),
      });
      if (pt) {
        return { paymentTermId: pt.id, paymentTerms: pt.name };
      }
      try {
        const baseCode =
          trimmed
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) || 'PT';
        let code = baseCode;
        let counter = 1;
        while (await termModel.findOne({ where: { code } })) {
          code = `${baseCode.slice(0, 35)}_${counter++}`;
        }
        let creditDays = 0;
        const match = trimmed.match(/^(\d+)\s*days?/i);
        if (match) creditDays = parseInt(match[1], 10);

        const newPt = await termModel.create({
          name: trimmed,
          code,
          creditDays,
          status: 'Active',
          createdBy: user?.userId,
          companyId,
        } as any);
        return { paymentTermId: newPt.id, paymentTerms: newPt.name };
      } catch {
        return { paymentTermId: null, paymentTerms: trimmed };
      }
    }
    return { paymentTermId: null, paymentTerms: null };
  }

  private async findSalesContractForEnquiry(
    enquiryId: string | null | undefined,
    businessTransactionId: number | null | undefined,
    options: Omit<FindOptions, 'where'> = {},
  ): Promise<SalesContract | null> {
    if (enquiryId) {
      const byEnquiry = await this.salesContractModel.findOne({
        ...options,
        where: { enquiryId },
      });
      if (byEnquiry) return byEnquiry;
    }

    if (businessTransactionId == null) return null;

    return this.salesContractModel.findOne({
      ...options,
      where: { businessTransactionId },
      order: options.order ?? [['updatedAt', 'DESC'], ['id', 'DESC']],
    });
  }

  private async findRoutesForShipment(
    logisticsId: number,
    shipmentId: number,
  ) {
    const quotes = await this.quoteModel.findAll({
      where: { shipmentId },
      attributes: ['routeId'],
    });
    const routeIds = [
      ...new Set(
        quotes
          .map((quote) => Number(quote.routeId))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];
    if (routeIds.length === 0) return [];

    return this.logisticsRouteModel.findAll({
      where: { logisticsId, id: { [Op.in]: routeIds } },
    });
  }

  async fixDb() {
    try {
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "is_direct" BOOLEAN DEFAULT false;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "product_id" INTEGER;`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "origin" VARCHAR(255);`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "destination" VARCHAR(255);`,
      );
      await this.sequelize.query(
        `ALTER TABLE "freight_quotes" ADD COLUMN IF NOT EXISTS "payment_term_id" INTEGER;`,
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

  async findQueue(
    query: QueryLogisticsDto,
    companyId: number = 1,
    userId?: number,
  ) {
    const {
      search,
      businessReference,
      mode,
      status,
      hiddenOnly,
      tab,
      type,
      page = 1,
      limit = 10,
      sortBy,
      sortOrder,
    } = query;
    const offset = (page - 1) * limit;

    const normalizedTab = (tab || type || '').trim().toLowerCase();
    const isPurchaseContractsTab =
      normalizedTab === 'purchase-contracts' ||
      normalizedTab === 'purchase_contracts' ||
      normalizedTab === 'purchase-contract' ||
      normalizedTab === 'purchase contracts';

    if (isPurchaseContractsTab) {
      return this.findPurchaseContractsQueue(query, companyId, userId);
    }

    const effectiveHiddenOnly =
      hiddenOnly ||
      normalizedTab === 'hidden';

    const effectiveStatus =
      normalizedTab === 'closed'
        ? 'Closed'
        : normalizedTab === 'active' || normalizedTab === 'active-queue'
          ? 'Active'
          : status || 'Active';

    const company = (await this.sequelize.models.Company.findByPk(
      companyId,
    )) as any;
    const companyCountry = company?.country;

    // ── Base Enquiry Conditions ───────────────────────────────────────────────
    // Exclude cancelled enquiries (show NEW, PENDING, CONFIRMED, CLOSED, etc.)
    const whereConditions: any[] = [
      { status: { [Op.notIn]: ['CANCELLED'] } },
      { companyId },
    ];

    if (businessReference) {
      const transactionId =
        (await resolveBusinessTransactionId(businessReference, companyId)) ??
        -1;
      whereConditions.push({
        [Op.or]: [
          { businessTransactionId: transactionId },
          { '$logistics.business_transaction_id$': transactionId },
        ],
      });
    }

    if (userId) {
      const hiddenRows = await this.transportEnquiryHiddenModel.findAll({
        where: { userId, companyId },
        attributes: ['enquiryId'],
        raw: true,
      });
      const hiddenEnquiryIds = hiddenRows.map((row: any) => row.enquiryId);
      if (effectiveHiddenOnly) {
        whereConditions.push({
          id: { [Op.in]: hiddenEnquiryIds },
        });
      } else if (hiddenEnquiryIds.length > 0) {
        whereConditions.push({ id: { [Op.notIn]: hiddenEnquiryIds } });
      }
    } else if (effectiveHiddenOnly) {
      whereConditions.push({ id: { [Op.in]: [] } });
    }

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
      const searchCondition: any = {
        [Op.or]: [
          { enquiryNo: { [Op.iLike]: `%${s}%` } },
          { '$partner.entity_name$': { [Op.iLike]: `%${s}%` } },
          { '$product.name$': { [Op.iLike]: `%${s}%` } },
          {
            '$businessTransaction.businessReference$': {
              [Op.iLike]: `%${s}%`,
            },
          },
          {
            '$logistics.purchaseContract.contract_number$': {
              [Op.iLike]: `%${s}%`,
            },
          },
        ],
      };
      if (isBusinessReferenceSearch(s)) {
        const transactionId = await resolveBusinessTransactionId(s, companyId);
        if (transactionId !== null) {
          searchCondition[Op.or].push({
            businessTransactionId: transactionId,
          });
          searchCondition[Op.or].push({
            '$logistics.business_transaction_id$': transactionId,
          });
        }
      }
      whereConditions.push(searchCondition);
    }

    // ── Logistics Status Filter (Active vs Closed) ────────────────────────────
    const terminalStatuses = LogisticsService.TERMINAL_LOGISTICS_STATUSES;

    if (!effectiveHiddenOnly && effectiveStatus === 'Closed') {
      whereConditions.push({
        '$logistics.status$': { [Op.in]: terminalStatuses },
      });
    } else if (!effectiveHiddenOnly && effectiveStatus === 'Active') {
      whereConditions.push({
        [Op.or]: [
          { '$logistics.id$': null },
          { '$logistics.status$': { [Op.notIn]: terminalStatuses } },
        ],
      });
    }

    const whereEnquiry: any = { [Op.and]: whereConditions };
    const order: Order =
      sortBy === 'businessReference'
        ? [
          [
            { model: BusinessTransaction, as: 'businessTransaction' },
            'businessReference',
            String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
          ],
        ]
        : [['createdAt', 'DESC']];

    const { rows, count } = await this.enquiryModel.findAndCountAll({
      where: whereEnquiry,
      include: [
        { model: Partner, as: 'partner', attributes: ['id', 'entityName'] },
        { model: Product, as: 'product', attributes: ['id', 'name'] },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: TransportDetail,
          as: 'transportDetails',
          required: false,
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
              model: this.sequelize.models.PurchaseContract,
              as: 'purchaseContract',
              required: false,
              attributes: ['id', 'contractNumber'],
            },
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
      order,
    });

    const data = await this.attachPurchaseContractsToEnquiries(rows, companyId);

    // Section 8: Generate independent transport queue records for every qualifying Transport Details row
    const queueRecords: any[] = [];
    const freightRequiredByPair = new Map<string, boolean>();
    const getFreightRequired = (pcSt: any, scSt: any): boolean => {
      const pcCode = extractIncotermCode(pcSt);
      const scCode = extractIncotermCode(scSt);
      const pairKey = `${pcCode}__${scCode}`;
      let cached = freightRequiredByPair.get(pairKey);
      if (cached === undefined) {
        cached = evaluateFreightRequired(pcSt, scSt).freightRequired;
        freightRequiredByPair.set(pairKey, cached);
      }
      return cached;
    };

    for (const item of data) {
      const details = item.transportDetails;
      if (Array.isArray(details) && details.length > 0) {
        const qualifying = details
          .map((route: any) => ({
            route,
            freightRequired: getFreightRequired(
              item.purchaseContract?.shipmentType,
              route.incoterm ||
                item.salesContract?.shipmentType ||
                item.shipmentType,
            ),
          }))
          .filter((entry) => entry.freightRequired);
        for (const { route, freightRequired } of qualifying) {
          queueRecords.push({
            ...item,
            id: item.id,
            queueRowId: `${item.id}_${route.sequence || route.id}`,
            enquiryId: item.id,
            transportDetailId: route.id,
            sequence: route.sequence,
            routeSequence: route.sequence,
            origin: route.origin,
            incoterm: route.incoterm,
            destination: route.destination,
            freightRequired,
            transportRoute: route,
          });
        }
      } else {
        const freightRequired =
          typeof item.freightRequired === 'boolean'
            ? item.freightRequired
            : getFreightRequired(
                item.purchaseContract?.shipmentType,
                item.salesContract?.shipmentType || item.shipmentType,
              );
        if (freightRequired) {
          queueRecords.push({
            ...item,
            id: item.id,
            queueRowId: `${item.id}_1`,
            enquiryId: item.id,
            origin: item.originPort || item.originCity || '—',
            destination: item.destinationPort || item.destinationCity || '—',
            incoterm: item.shipmentType || 'CFR',
            freightRequired,
          });
        }
      }
    }

    return {
      data: queueRecords,
      total: queueRecords.length,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(queueRecords.length / limit) || 1,
    };
  }

  /**
   * Dedicated Purchase Contracts Queue for Transport Management (Backend Driven).
   * Returns ONLY Purchase Contract records, completely filtered and paginated on the database.
   */
  async findPurchaseContractsQueue(
    query: QueryLogisticsDto,
    companyId: number = 1,
    userId?: number,
  ) {
    const {
      search,
      businessReference,
      mode,
      page = 1,
      limit = 10,
      sortBy,
      sortOrder,
    } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const company = (await this.sequelize.models.Company.findByPk(
      companyId,
    )) as any;
    const companyCountry = company?.country;
    const normCompanyCountry = companyCountry?.trim().toLowerCase() || null;

    const whereConditions: string[] = [
      '(pc.company_id = :companyId OR pc.company_id IS NULL OR :companyId IS NULL)',
      "pc.status NOT IN ('Cancelled', 'CANCELLED')",
    ];
    const replacements: any = {
      companyId,
    };

    // Filter out user-hidden enquiries if applicable
    if (userId) {
      const hiddenRows = await this.transportEnquiryHiddenModel.findAll({
        where: { userId, companyId },
        attributes: ['enquiryId'],
        raw: true,
      });
      const hiddenEnquiryIds = hiddenRows.map((row: any) => row.enquiryId);
      if (hiddenEnquiryIds.length > 0) {
        whereConditions.push(
          '(sc.enquiry_id IS NULL OR sc.enquiry_id NOT IN (:hiddenEnquiryIds))',
        );
        replacements.hiddenEnquiryIds = hiddenEnquiryIds;
      }
    }

    // 1. Business Reference filter
    if (businessReference && businessReference.trim()) {
      const bRef = businessReference.trim();
      const transactionId = await resolveBusinessTransactionId(bRef, companyId);
      whereConditions.push(
        `(bt.business_reference = :bRefExact OR pc.business_transaction_id = :bRefTxId)`,
      );
      replacements.bRefExact = bRef;
      replacements.bRefTxId = transactionId ?? -1;
    }

    // 2. Search filter
    if (search && search.trim()) {
      const s = search.trim();
      replacements.searchLike = `%${s}%`;
      const searchParts = [
        'pc.contract_number ILIKE :searchLike',
        'seller.entity_name ILIKE :searchLike',
        'buyer.entity_name ILIKE :searchLike',
        'COALESCE(pci.product_name, prod.name) ILIKE :searchLike',
        'bt.business_reference ILIKE :searchLike',
        'sc.contract_number ILIKE :searchLike',
      ];
      if (isBusinessReferenceSearch(s)) {
        const txId = await resolveBusinessTransactionId(s, companyId);
        if (txId !== null) {
          replacements.searchTxId = txId;
          searchParts.push('pc.business_transaction_id = :searchTxId');
        }
      }
      whereConditions.push(`(${searchParts.join(' OR ')})`);
    }

    // 3. Mode filter
    if (normCompanyCountry && mode && mode !== 'All') {
      replacements.normCompCountry = `%${normCompanyCountry}%`;
      if (mode === 'Domestic') {
        whereConditions.push(
          `(COALESCE(pc.loading_country, pc.place_of_loading, '') ILIKE :normCompCountry AND COALESCE(sc.destination_country, sc.destination_location_name, pc.delivery_place, '') ILIKE :normCompCountry)`,
        );
      } else if (mode === 'Export') {
        whereConditions.push(
          `(COALESCE(pc.loading_country, pc.place_of_loading, '') ILIKE :normCompCountry AND COALESCE(sc.destination_country, sc.destination_location_name, pc.delivery_place, '') NOT ILIKE :normCompCountry)`,
        );
      } else if (mode === 'Merchant Export') {
        whereConditions.push(
          `(COALESCE(pc.loading_country, pc.place_of_loading, '') NOT ILIKE :normCompCountry AND COALESCE(sc.destination_country, sc.destination_location_name, pc.delivery_place, '') NOT ILIKE :normCompCountry)`,
        );
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // Sorting
    const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderClause =
      sortBy === 'businessReference'
        ? `ORDER BY bt.business_reference ${sortDir} NULLS LAST, pc.id DESC`
        : `ORDER BY pc.created_at DESC, pc.id DESC`;

    const selectQuery = `
      SELECT 
        pc.id,
        pc.status,
        pc.contract_number,
        pc.quantity,
        pc.place_of_loading,
        pc.loading_country,
        pc.delivery_place,
        pc.purchase_date,
        pc.created_at,
        pc.sales_contract_id,
        pc.business_transaction_id,
        pc.shipment_type_id,
        pc.buyer_id,
        pc.seller_id,
        seller.entity_name AS seller_name,
        buyer.entity_name AS buyer_name,
        st.name AS shipment_type_name,
        st.code AS purchase_shipment_type_code,
        COALESCE(log.transport_mode, sc.transport_mode, 'ROAD') AS transport_mode,
        bt.business_reference AS business_reference,
        sc.enquiry_id AS sc_enquiry_id,
        sc_st.code AS sales_shipment_type_code,
        sc.contract_number AS sc_contract_number,
        sc.destination_location_name AS sc_destination_location_name,
        sc.port_of_discharge AS sc_port_of_discharge,
        COALESCE(sc.destination_location_name, sc.port_of_discharge, sc.enquiry_destination) AS sc_delivery_place,
        sc.destination_country AS sc_destination_country,
        sc_buyer.entity_name AS sc_buyer_name,
        pci.product_id AS product_id,
        COALESCE(pci.product_name, prod.name) AS product_name,
        log.id AS logistics_id,
        log.status AS logistics_status,
        log.is_viewed AS logistics_is_viewed
      FROM purchase_contracts pc
      LEFT JOIN partners seller ON pc.seller_id = seller.id
      LEFT JOIN partners buyer ON pc.buyer_id = buyer.id
      LEFT JOIN sales_contracts sc ON pc.sales_contract_id = sc.id
      LEFT JOIN shipment_types sc_st ON sc.shipment_type_id = sc_st.id
      LEFT JOIN partners sc_buyer ON sc.buyer_id = sc_buyer.id
      LEFT JOIN shipment_types st ON pc.shipment_type_id = st.id
      LEFT JOIN business_transactions bt ON pc.business_transaction_id = bt.id
      LEFT JOIN LATERAL (
        SELECT product_id, product_name 
        FROM purchase_contract_items 
        WHERE purchase_contract_id = pc.id 
        ORDER BY id ASC LIMIT 1
      ) pci ON true
      LEFT JOIN products prod ON pci.product_id = prod.id
      LEFT JOIN LATERAL (
        SELECT id, status, is_viewed, transport_mode 
        FROM logistics 
        WHERE purchase_contract_id = pc.id 
           OR (sc.enquiry_id IS NOT NULL AND enquiry_id = sc.enquiry_id)
        ORDER BY id DESC LIMIT 1
      ) log ON true
      WHERE ${whereClause}
      ${orderClause}
    `;

    const selectRows: any[] = await this.sequelize.query(selectQuery, {
      replacements,
      type: QueryTypes.SELECT,
    });
    const matrixCache = new Map<string, boolean>();
    const evaluatedRows = (selectRows || []).map((pc) => {
      const pcCode = pc.purchase_shipment_type_code || '';
      const scCode = pc.sales_shipment_type_code || '';
      const pairKey = `${pcCode}__${scCode}`;
      let matrixFreightRequired = matrixCache.get(pairKey);
      if (matrixFreightRequired === undefined) {
        matrixFreightRequired = evaluateFreightRequired(
          { code: pcCode },
          { code: scCode },
        ).freightRequired;
        matrixCache.set(pairKey, matrixFreightRequired);
      }
      return {
        ...pc,
        matrixFreightRequired,
      };
    });
    const eligibleRows = evaluatedRows.filter((pc) => pc.matrixFreightRequired);
    const total = eligibleRows.length;
    const pageRows = eligibleRows.slice(offset, offset + Number(limit));
    const data = pageRows.map((pc: any) => {
      const origin =
        formatLogisticsLocation(pc.place_of_loading, pc.loading_country) ||
        '—';
      const destination =
        pc.sc_destination_location_name ||
        pc.sc_delivery_place ||
        pc.sc_port_of_discharge ||
        pc.delivery_place ||
        '—';
      const incoterm = pc.shipment_type_name || '—';

      return {
        id: pc.sc_enquiry_id || String(pc.id),
        recordId: `pc_${pc.id}`,
        queueRowId: `pc_${pc.id}`,
        enquiryId: pc.sc_enquiry_id || null,
        purchaseContractId: Number(pc.id),
        enquiryNo: null, // As requested: Example: PC-EA.2632627, No Enquiry records should be returned
        businessReference: pc.business_reference || null,
        businessTransaction: pc.business_transaction_id
          ? {
            id: pc.business_transaction_id,
            businessReference: pc.business_reference,
          }
          : null,
        purchaseContract: {
          id: pc.id,
          status: pc.status,
          contractNumber: pc.contract_number,
          freightRequired: pc.matrixFreightRequired,
          quantity: pc.quantity || null,
          placeOfLoading: pc.place_of_loading || null,
          loadingCountry: pc.loading_country || null,
          deliveryPlace: pc.delivery_place || null,
          purchaseDate: pc.purchase_date || null,
          productName: pc.product_name || null,
          productId: pc.product_id || null,
          buyerName: pc.buyer_name || null,
          sellerName: pc.seller_name || null,
          shipmentTypeName: pc.shipment_type_name || null,
          shipmentType: pc.purchase_shipment_type_code
            ? { code: pc.purchase_shipment_type_code }
            : null,
        },
        salesContract: pc.sales_contract_id
          ? {
            id: pc.sales_contract_id,
            contractNumber: pc.sc_contract_number || null,
            destinationLocationName: pc.sc_destination_location_name || null,
            deliveryPlace: pc.sc_delivery_place || null,
            destinationCountry: pc.sc_destination_country || null,
            buyerName: pc.sc_buyer_name || null,
            shipmentType: pc.sales_shipment_type_code
              ? { code: pc.sales_shipment_type_code }
              : null,
          }
          : null,
        origin,
        destination,
        incoterm,
        shipmentMode: pc.transport_mode ? pc.transport_mode.toUpperCase() : 'ROAD',
        quantity: pc.quantity ? Number(pc.quantity) : 0,
        purchaseDate: pc.purchase_date || null,
        enquiryDate: pc.purchase_date || null,
        partner: {
          entityName: pc.seller_name || pc.buyer_name || '—',
        },
        product: {
          name: pc.product_name || '—',
        },
        logistics: {
          id: pc.logistics_id || null,
          status: pc.logistics_status || 'Pending',
          isViewed: pc.logistics_is_viewed !== false,
        },
        sourceType: 'PurchaseContract',
        isPurchaseContract: true,
      };
    });

    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    };
  }

  private async attachPurchaseContractsToEnquiries(
    enquiries: Enquiry[],
    companyId: number = 1,
  ): Promise<any[]> {
    if (!enquiries || enquiries.length === 0) return [];

    const enquiryIds = enquiries.map((e) => e.id).filter(Boolean);
    const btIds = enquiries
      .map((e) => e.businessTransactionId)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    const pcIds: number[] = [];
    for (const e of enquiries) {
      const pcId =
        (e as any).logistics?.purchaseContractId ||
        (e as any).logistics?.purchase_contract_id;
      if (typeof pcId === 'number' && pcId > 0 && !pcIds.includes(pcId)) {
        pcIds.push(pcId);
      }
    }

    const pcById = new Map<number, any>();
    const pcByEnquiryId = new Map<string, any>();
    const pcByBtId = new Map<number, any>();

    if (pcIds.length > 0 || enquiryIds.length > 0 || btIds.length > 0) {
      try {
        const query = `
          SELECT 
            pc.id,
            pc.status,
            pc.contract_number,
            pc.quantity,
            pc.place_of_loading,
            pc.loading_country,
            pc.delivery_place,
            pc.purchase_date,
            pc.sales_contract_id,
            pc.business_transaction_id,
            pc.shipment_type_id,
            st.code AS purchase_shipment_type_code,
            pc.buyer_id,
            pc.seller_id,
            seller.entity_name AS seller_name,
            buyer.entity_name AS buyer_name,
            st.name AS shipment_type_name,
            bt.business_reference AS business_reference,
            sc.enquiry_id AS sc_enquiry_id,
            sc_st.code AS sales_shipment_type_code,
            sc.destination_location_name AS sc_destination_location_name,
            sc.port_of_discharge AS sc_port_of_discharge,
            sc.destination_country AS sc_destination_country,
            sc_buyer.entity_name AS sc_buyer_name,
            pci.product_id AS pci_product_id,
            COALESCE(pci.product_name, prod.name) AS product_name
          FROM purchase_contracts pc
          LEFT JOIN partners seller ON pc.seller_id = seller.id
          LEFT JOIN partners buyer ON pc.buyer_id = buyer.id
          LEFT JOIN sales_contracts sc ON pc.sales_contract_id = sc.id
          LEFT JOIN shipment_types sc_st ON sc.shipment_type_id = sc_st.id
          LEFT JOIN partners sc_buyer ON sc.buyer_id = sc_buyer.id
          LEFT JOIN shipment_types st ON pc.shipment_type_id = st.id
          LEFT JOIN business_transactions bt ON pc.business_transaction_id = bt.id
          LEFT JOIN LATERAL (
            SELECT product_id, product_name 
            FROM purchase_contract_items 
            WHERE purchase_contract_id = pc.id 
            ORDER BY id ASC LIMIT 1
          ) pci ON true
          LEFT JOIN products prod ON pci.product_id = prod.id
          WHERE (
            ${pcIds.length > 0 ? '(pc.id IN (:pcIds))' : '1=0'}
            ${enquiryIds.length > 0 ? 'OR (sc.enquiry_id IN (:enquiryIds))' : ''}
            ${btIds.length > 0 ? 'OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id IN (:btIds))' : ''}
          )
          AND (pc.company_id = :companyId OR pc.company_id IS NULL OR :companyId IS NULL)
          ORDER BY pc.updated_at DESC, pc.id DESC
        `;

        const rows: any[] = await this.sequelize.query(query, {
          replacements: {
            ...(pcIds.length > 0 ? { pcIds } : {}),
            ...(enquiryIds.length > 0 ? { enquiryIds } : {}),
            ...(btIds.length > 0 ? { btIds } : {}),
            companyId,
          },
          type: QueryTypes.SELECT,
        });

        for (const pc of rows) {
          pcById.set(Number(pc.id), pc);
          if (pc.sc_enquiry_id && !pcByEnquiryId.has(pc.sc_enquiry_id)) {
            pcByEnquiryId.set(pc.sc_enquiry_id, pc);
          }
          if (
            pc.business_transaction_id &&
            !pcByBtId.has(Number(pc.business_transaction_id))
          ) {
            pcByBtId.set(Number(pc.business_transaction_id), pc);
          }
        }
      } catch (err) {
        console.error(
          'Failed to query purchase contracts for transport queue:',
          err,
        );
      }
    }

    return enquiries.map((enquiry) => {
      const plain: any =
        typeof enquiry.toJSON === 'function'
          ? enquiry.toJSON()
          : { ...enquiry };
      const pcIdFromLogistics =
        plain.logistics?.purchaseContractId ||
        plain.logistics?.purchase_contract_id;

      const matchedPc =
        (pcIdFromLogistics ? pcById.get(Number(pcIdFromLogistics)) : null) ||
        pcByEnquiryId.get(plain.id) ||
        (plain.businessTransactionId
          ? pcByBtId.get(Number(plain.businessTransactionId))
          : null);
      const purchaseShipmentType = matchedPc
        ? { code: matchedPc.purchase_shipment_type_code }
        : null;
      const salesShipmentType = matchedPc
        ? { code: matchedPc.sales_shipment_type_code }
        : plain.shipmentType || null;
      const freightRequired = evaluateFreightRequired(
        purchaseShipmentType,
        salesShipmentType,
      ).freightRequired;
      plain.freightRequired = freightRequired;

      if (matchedPc?.business_reference && !plain.businessReference) {
        plain.businessReference = matchedPc.business_reference;
        if (!plain.businessTransaction) {
          plain.businessTransaction = {
            id: matchedPc.business_transaction_id,
            businessReference: matchedPc.business_reference,
          };
        }
      }

      const scDest =
        matchedPc?.sc_destination_location_name ||
        matchedPc?.sc_port_of_discharge ||
        null;
      plain.salesContract = matchedPc
        ? {
          destinationLocationName: scDest,
          deliveryPlace: scDest,
          destinationCountry: matchedPc.sc_destination_country || null,
          buyerName: matchedPc.sc_buyer_name || null,
          shipmentType: matchedPc.sales_shipment_type_code
            ? { code: matchedPc.sales_shipment_type_code }
            : null,
        }
        : null;

      plain.purchaseContract = matchedPc
        ? {
          id: matchedPc.id,
          status: matchedPc.status,
          contractNumber: matchedPc.contract_number,
          freightRequired,
          quantity: matchedPc.quantity || null,
          placeOfLoading: matchedPc.place_of_loading || null,
          loadingCountry: matchedPc.loading_country || null,
          deliveryPlace: matchedPc.delivery_place || null,
          shipmentTypeId: matchedPc.shipment_type_id || null,
          shipmentTypeName: matchedPc.shipment_type_name || null,
          shipmentType: matchedPc.purchase_shipment_type_code
            ? { code: matchedPc.purchase_shipment_type_code }
            : null,
          businessReference: matchedPc.business_reference || null,
          buyerId: matchedPc.buyer_id || null,
          buyerName: matchedPc.buyer_name || null,
          sellerId: matchedPc.seller_id || null,
          sellerName: matchedPc.seller_name || null,
          productName: matchedPc.product_name || null,
          productId: matchedPc.pci_product_id || null,
          purchaseDate: matchedPc.purchase_date || null,
        }
        : null;

      if (typeof enquiry.setDataValue === 'function') {
        enquiry.setDataValue('purchaseContract', plain.purchaseContract);
      }

      return plain;
    });
  }

  async hideEnquiryFromTransport(
    enquiryId: string,
    userId: number,
    companyId: number,
  ) {
    if (!userId || !companyId) {
      throw new BadRequestException(
        'A signed-in user and active company are required.',
      );
    }

    const cleanEnquiryId = enquiryId
      ? String(enquiryId).split('_')[0]
      : enquiryId;

    const enquiry = await this.enquiryModel.findOne({
      where: { id: cleanEnquiryId, companyId },
      attributes: ['id'],
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');

    await this.transportEnquiryHiddenModel.findOrCreate({
      where: { userId, companyId, enquiryId: cleanEnquiryId },
      defaults: { userId, companyId, enquiryId: cleanEnquiryId },
    });

    return { success: true };
  }

  async unhideEnquiryFromTransport(
    enquiryId: string,
    userId: number,
    companyId: number,
  ) {
    if (!userId || !companyId) {
      throw new BadRequestException(
        'A signed-in user and active company are required.',
      );
    }

    const cleanEnquiryId = enquiryId
      ? String(enquiryId).split('_')[0]
      : enquiryId;

    await this.transportEnquiryHiddenModel.destroy({
      where: { userId, companyId, enquiryId: cleanEnquiryId },
    });
    return { success: true };
  }

  /**
   * Get ALL freight quotes across all logistics records — centralized repository view.
   */
  async getAllFreightQuotes(
    query: {
      search?: string;
      businessReference?: string;
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
      businessReference,
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

    if (businessReference) {
      quoteWhereConditions.push({
        businessTransactionId:
          (await resolveBusinessTransactionId(businessReference, companyId)) ??
          -1,
      });
    }

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
      const term = search.trim();
      const s = `%${term}%`;
      const searchConditions: any[] = [
        { quoteNumber: { [Op.iLike]: s } },
        { '$seller.entity_name$': { [Op.iLike]: s } },
        { '$logistics.enquiry.enquiry_no$': { [Op.iLike]: s } },
        { '$logistics.enquiry.product.name$': { [Op.iLike]: s } },
        { '$logistics.enquiry.origin_city$': { [Op.iLike]: s } },
        { '$logistics.enquiry.origin_port$': { [Op.iLike]: s } },
        { '$logistics.enquiry.destination_city$': { [Op.iLike]: s } },
        { '$logistics.enquiry.destination_port$': { [Op.iLike]: s } },
      ];
      if (isBusinessReferenceSearch(term)) {
        const transactionId = await resolveBusinessTransactionId(
          term,
          companyId,
        );
        if (transactionId !== null) {
          searchConditions.push({ businessTransactionId: transactionId });
        }
      }
      quoteWhereConditions.push({
        [Op.or]: searchConditions,
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
          { origin: { [Op.iLike]: orig } },
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
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
        { model: PaymentTerm, as: 'paymentTerm' },
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
                {
                  model: TransportDetail,
                  as: 'transportDetails',
                  required: false,
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
      order:
        sortBy === 'businessReference'
          ? [
            [
              { model: BusinessTransaction, as: 'businessTransaction' },
              'businessReference',
              orderDir,
            ],
          ]
          : [[orderCol, orderDir]],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
      distinct: true,
      subQuery: false,
    });

    const rawQuotes = rows.map((row) => {
      const data = row.toJSON();
      return {
        ...data,
        businessReference: data.businessTransaction?.businessReference ?? null,
      };
    });

    const data = await this.attachPurchaseContractsToQuotes(
      rawQuotes,
      companyId,
    );

    return {
      data,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    };
  }

  private async attachPurchaseContractsToQuotes(
    quotes: any[],
    companyId: number = 1,
  ): Promise<any[]> {
    if (!quotes || quotes.length === 0) return [];

    const enquiryIds: string[] = [];
    const btIds: number[] = [];

    for (const q of quotes) {
      const enqId = q.logistics?.enquiry?.id;
      if (enqId && !enquiryIds.includes(enqId)) {
        enquiryIds.push(enqId);
      }
      const btId =
        q.businessTransactionId ||
        q.businessTransaction?.id ||
        q.logistics?.enquiry?.businessTransactionId;
      if (typeof btId === 'number' && btId > 0 && !btIds.includes(btId)) {
        btIds.push(btId);
      }
    }

    if (enquiryIds.length === 0 && btIds.length === 0) {
      return quotes;
    }

    const pcByEnquiryId = new Map<string, any>();
    const pcByBtId = new Map<number, any>();

    try {
      const query = `
        SELECT 
          pc.id,
          pc.contract_number,
          pc.place_of_loading,
          pc.delivery_place,
          pc.sales_contract_id,
          pc.business_transaction_id,
          sc.enquiry_id as sc_enquiry_id,
          sc.destination_location_name as sc_destination_location_name,
          sc.port_of_discharge as sc_port_of_discharge
        FROM purchase_contracts pc
        LEFT JOIN sales_contracts sc ON pc.sales_contract_id = sc.id
        WHERE (
          ${enquiryIds.length > 0 ? '(sc.enquiry_id IN (:enquiryIds))' : '1=0'}
          ${btIds.length > 0 ? 'OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id IN (:btIds))' : ''}
        )
        AND (pc.company_id = :companyId OR pc.company_id IS NULL OR :companyId IS NULL)
        ORDER BY pc.updated_at DESC, pc.id DESC
      `;

      const pcRows: any[] = await this.sequelize.query(query, {
        replacements: {
          ...(enquiryIds.length > 0 ? { enquiryIds } : {}),
          ...(btIds.length > 0 ? { btIds } : {}),
          companyId,
        },
        type: QueryTypes.SELECT,
      });

      for (const pc of pcRows) {
        if (pc.sc_enquiry_id && !pcByEnquiryId.has(pc.sc_enquiry_id)) {
          pcByEnquiryId.set(pc.sc_enquiry_id, pc);
        }
        if (
          pc.business_transaction_id &&
          !pcByBtId.has(Number(pc.business_transaction_id))
        ) {
          pcByBtId.set(Number(pc.business_transaction_id), pc);
        }
      }
    } catch (err) {
      console.error('Failed to query purchase contracts for quotes:', err);
    }

    return quotes.map((quote) => {
      const enqId = quote.logistics?.enquiry?.id;
      const btId =
        quote.businessTransactionId ||
        quote.businessTransaction?.id ||
        quote.logistics?.enquiry?.businessTransactionId;

      const matchedPc =
        (enqId ? pcByEnquiryId.get(enqId) : null) ||
        (typeof btId === 'number' ? pcByBtId.get(btId) : null);

      const purchaseContract = matchedPc
        ? {
          id: matchedPc.id,
          contractNumber: matchedPc.contract_number,
          placeOfLoading: matchedPc.place_of_loading || null,
          loadingCountry: matchedPc.loading_country || null,
          deliveryPlace: matchedPc.delivery_place || null,
          salesContractDestination:
            matchedPc.sc_destination_location_name ||
            matchedPc.sc_port_of_discharge ||
            null,
        }
        : null;

      quote.purchaseContract = purchaseContract;
      if (quote.logistics?.enquiry) {
        quote.logistics.enquiry.purchaseContract = purchaseContract;
      }

      return quote;
    });
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
   * Synchronize logistics workspace, routes, and freight quotes for an enquiry
   * based on its latest Transport Details.
   */
  async syncLogisticsRoutesForEnquiry(
    enquiryId: string,
    companyId: number = 1,
    parentTransaction?: any,
  ): Promise<LogisticsRoute[]> {
    const cleanEnquiryId = enquiryId
      ? String(enquiryId).split('_')[0]
      : enquiryId;
    if (!cleanEnquiryId) return [];

    const enquiry = await this.enquiryModel.findOne({
      where: { id: cleanEnquiryId, ...(companyId ? { companyId } : {}) },
      include: [
        { model: TransportDetail, as: 'transportDetails', required: false },
        { model: Partner, as: 'partner', required: false },
        { model: Product, as: 'product', required: false },
      ],
      transaction: parentTransaction,
    });
    if (!enquiry) return [];

    const salesContract = await this.findSalesContractForEnquiry(
      cleanEnquiryId,
      enquiry.businessTransactionId,
      {
        include: [
          { model: this.sequelize.models.ShipmentType, as: 'shipmentType' },
          {
            model: this.sequelize.models.TransportDetail,
            as: 'transportDetails',
            required: false,
          },
        ],
        transaction: parentTransaction,
      },
    );

    const purchaseShipmentTypes: any[] = await this.sequelize.query(
      `SELECT st.code
       FROM purchase_contracts pc
       JOIN shipment_types st ON st.id = pc.shipment_type_id
       WHERE pc.sales_contract_id = :salesContractId
          OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :businessTransactionId)
       ORDER BY pc.updated_at DESC, pc.id DESC
       LIMIT 1`,
      {
        replacements: {
          salesContractId: (salesContract as any)?.id || -1,
          businessTransactionId:
            (salesContract as any)?.businessTransactionId ||
            enquiry.businessTransactionId ||
            -1,
        },
        type: QueryTypes.SELECT,
        ...(parentTransaction ? { transaction: parentTransaction } : {}),
      },
    );
    const purchaseShipmentType = purchaseShipmentTypes[0]
      ? { code: purchaseShipmentTypes[0].code }
      : null;
    const salesShipmentType =
      (salesContract as any)?.shipmentType || enquiry.shipmentType || null;
    const isRouteFreightRequired = (incoterm?: string | null) =>
      evaluateFreightRequired(
        purchaseShipmentType,
        incoterm || salesShipmentType,
      ).freightRequired;

    // 1. Determine transportDetails source (Enquiry priority, SalesContract fallback)
    const details: any[] =
      enquiry.transportDetails && enquiry.transportDetails.length > 0
        ? enquiry.transportDetails
        : (salesContract as any)?.transportDetails || [];

    // Filter for qualifying routes (FreightRequired = true)
    const qualifying = details.filter((td: any) =>
      isRouteFreightRequired(td.incoterm),
    );

    const expectedRoutes: {
      origin: string;
      destination: string;
      incoterm?: string;
      sequence?: number;
    }[] = [];

    if (qualifying.length > 0) {
      for (const td of qualifying) {
        if (td.origin?.trim() && td.destination?.trim()) {
          expectedRoutes.push({
            origin: td.origin.trim(),
            destination: td.destination.trim(),
            incoterm: td.incoterm?.trim(),
            sequence: td.sequence,
          });
        }
      }
    } else if (details.length > 0) {
      // User entered transport details, but all have freightRequired = false (e.g. FOB)
    } else {
      // Fallback: check legacy/enquiry fields
      const origin =
        enquiry.originPort ||
        (enquiry.originCity
          ? `${enquiry.originCity}${enquiry.originState ? `, ${enquiry.originState}` : ''}`
          : null);
      const destination =
        enquiry.destinationPort ||
        (enquiry.destinationCity
          ? `${enquiry.destinationCity}${enquiry.destinationState ? `, ${enquiry.destinationState}` : ''}`
          : null) ||
        enquiry.destinationCountry;

      if (
        origin &&
        destination &&
        isRouteFreightRequired(enquiry.shipmentType)
      ) {
        expectedRoutes.push({
          origin,
          destination,
          incoterm: enquiry.shipmentType || 'CFR',
          sequence: 1,
        });
      }
    }

    let logistics = await this.logisticsModel.findOne({
      where: { enquiryId: cleanEnquiryId },
      transaction: parentTransaction,
    });

    if (!logistics && expectedRoutes.length === 0) {
      return [];
    }

    if (!logistics) {
      // Auto-create workspace
      await this.sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS logistics_no_seq START 1;`,
        { transaction: parentTransaction },
      );
      const [seqRes]: any = await this.sequelize.query(
        `SELECT nextval('logistics_no_seq')`,
        { type: QueryTypes.SELECT, transaction: parentTransaction } as any,
      );
      const nextVal = parseInt(
        seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
        10,
      );
      const currentYear = new Date().getFullYear();
      const logisticsNumber = `LOG/${currentYear}/${String(nextVal).padStart(6, '0')}`;

      let mode = 'International';
      let transportMode = 'Road';
      if (enquiry.shipmentMode === 'SHIP') transportMode = 'Sea';
      else if (enquiry.shipmentMode === 'RAIL') transportMode = 'Rail';

      logistics = await this.logisticsModel.create(
        {
          logisticsNumber,
          enquiryId: cleanEnquiryId,
          businessTransactionId: enquiry.businessTransactionId ?? null,
          mode,
          transportMode,
          status: 'Pending',
          companyId,
        },
        { transaction: parentTransaction },
      );
    }

    // Update logistics mode & transportMode if known
    if (expectedRoutes.length > 0) {
      const originStr = (
        expectedRoutes[0].origin ||
        enquiry.originCountryId ||
        ''
      )
        .trim()
        .toLowerCase();
      const destStr = (
        expectedRoutes[0].destination ||
        enquiry.destinationCountry ||
        ''
      )
        .trim()
        .toLowerCase();

      let mode = logistics.mode || 'International';
      const isOriginIndia =
        originStr.includes('india') ||
        originStr.includes('nagpur') ||
        originStr.includes('mumbai') ||
        originStr.includes('delhi') ||
        originStr.includes('nhava') ||
        originStr.includes('mundra');
      const isDestIndia =
        destStr.includes('india') ||
        destStr.includes('nagpur') ||
        destStr.includes('mumbai');

      if (originStr && destStr) {
        if (isOriginIndia && isDestIndia) {
          mode = 'Domestic';
        } else if (isOriginIndia && !isDestIndia) {
          mode = 'Export';
        } else if (!isOriginIndia && isDestIndia) {
          mode = 'Import';
        } else {
          mode = 'Merchant Export';
        }
      }

      let transportMode = logistics.transportMode || 'Road';
      if (enquiry.shipmentMode === 'SHIP') transportMode = 'Sea';
      else if (enquiry.shipmentMode === 'RAIL') transportMode = 'Rail';

      await logistics.update(
        { mode, transportMode },
        { transaction: parentTransaction },
      );
    }

    const existingRoutes = await this.logisticsRouteModel.findAll({
      where: { logisticsId: logistics.id },
      order: [['id', 'ASC']],
      transaction: parentTransaction,
    });

    const finalRoutes: LogisticsRoute[] = [];
    const matchedRouteIds = new Set<number>();

    for (const exp of expectedRoutes) {
      // 1. Exact match check
      let matched = existingRoutes.find(
        (r) =>
          !matchedRouteIds.has(r.id) &&
          r.origin === exp.origin &&
          r.destination === exp.destination,
      );

      if (matched) {
        matchedRouteIds.add(matched.id);
        finalRoutes.push(matched);
        continue;
      }

      // 2. Existing stale route check ("Unknown Origin", "Unknown Destination", "—", or unmatched)
      const staleOrUnmatched =
        existingRoutes.find(
          (r) =>
            !matchedRouteIds.has(r.id) &&
            (r.origin === 'Unknown Origin' ||
              r.destination === 'Unknown Destination' ||
              r.origin === '—' ||
              r.destination === '—'),
        ) || existingRoutes.find((r) => !matchedRouteIds.has(r.id));

      if (staleOrUnmatched) {
        const oldOrigin = staleOrUnmatched.origin;
        const oldDestination = staleOrUnmatched.destination;
        await staleOrUnmatched.update(
          {
            origin: exp.origin,
            destination: exp.destination,
          },
          { transaction: parentTransaction },
        );

        // Update all freight quotes attached to this route
        await this.quoteModel.update(
          { origin: exp.origin, destination: exp.destination },
          {
            where: { routeId: staleOrUnmatched.id },
            transaction: parentTransaction,
          },
        );

        // Update any freight_routes child table rows
        await this.sequelize.query(
          `UPDATE freight_routes 
           SET origin = :newOrigin, destination = :newDestination
           WHERE (origin = :oldOrigin OR origin = 'Unknown Origin')
             AND quote_id IN (SELECT id FROM freight_quotes WHERE logistics_id = :logisticsId)`,
          {
            replacements: {
              newOrigin: exp.origin,
              newDestination: exp.destination,
              oldOrigin,
              logisticsId: logistics.id,
            },
            transaction: parentTransaction,
          },
        );

        matchedRouteIds.add(staleOrUnmatched.id);
        finalRoutes.push(staleOrUnmatched);
      } else {
        // 3. Create new route
        const newRoute = await this.logisticsRouteModel.create(
          {
            logisticsId: logistics.id,
            origin: exp.origin,
            destination: exp.destination,
          },
          { transaction: parentTransaction },
        );
        matchedRouteIds.add(newRoute.id);
        finalRoutes.push(newRoute);
      }
    }

    // Clean up remaining existing routes
    for (const r of existingRoutes) {
      if (!matchedRouteIds.has(r.id)) {
        const quotesCount = await this.quoteModel.count({
          where: { routeId: r.id },
          transaction: parentTransaction,
        });
        if (quotesCount === 0) {
          await r.destroy({ transaction: parentTransaction });
        } else if (finalRoutes.length > 0) {
          // Reassign quotes to the primary valid route, then delete stale route
          await this.quoteModel.update(
            {
              routeId: finalRoutes[0].id,
              origin: finalRoutes[0].origin,
              destination: finalRoutes[0].destination,
            },
            { where: { routeId: r.id }, transaction: parentTransaction },
          );
          await r.destroy({ transaction: parentTransaction });
        } else {
          finalRoutes.push(r);
        }
      }
    }

    return finalRoutes;
  }

  /**
   * Get detail logistics workspace of an enquiry.
   * Auto-creates the Logistics record if missing.
   */
  async getDetails(
    enquiryId: string,
    companyId: number = 1,
    targetShipmentId?: number,
  ) {
    let cleanEnquiryId = enquiryId
      ? String(enquiryId).replace(/^pc_/i, '').split('_')[0]
      : enquiryId;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanEnquiryId,
      );

    // Validate if targetShipmentId was requested: Transport is ONLY available when freight is required
    let targetShipment: any = null;
    let targetShipmentReadiness: any = null;
    if (targetShipmentId) {
      targetShipment = await this.shipmentModel.findByPk(targetShipmentId, {
        include: [
          {
            model: this.salesContractModel,
            as: 'salesContract',
            include: [{ model: this.sequelize.models.ShipmentType, as: 'shipmentType' }],
          },
        ],
      });
      if (!targetShipment) {
        throw new NotFoundException(
          `Selected shipment #${targetShipmentId} not found`,
        );
      }
      targetShipmentReadiness =
        await this.readinessService.evaluate(targetShipment);
      const isFreightReq = targetShipmentReadiness?.freightRequired ?? false;
      if (!isFreightReq) {
        throw new BadRequestException(
          `Transport Management is not available for Shipment #${targetShipmentId} because Freight is not required (Freight Required = NO).`,
        );
      }
    }

    let enquiry: any = null;
    let initialPurchaseContract: any = null;

    if (isUuid) {
      enquiry = await this.enquiryModel.findOne({
        where: { id: cleanEnquiryId, companyId },
        include: [
          { model: Partner, as: 'partner' },
          { model: Product, as: 'product' },
          {
            model: TransportDetail,
            as: 'transportDetails',
            required: false,
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
    } else {
      // Find purchase contract directly
      const pcId = Number(cleanEnquiryId);
      const pcWhere: any = isNaN(pcId)
        ? { contractNumber: cleanEnquiryId }
        : { id: pcId };
      const pc = (await this.sequelize.models.PurchaseContract.findOne({
        where: { ...pcWhere, ...(companyId ? { companyId } : {}) },
        include: [
          { model: this.sequelize.models.ShipmentType, as: 'shipmentType' },
          {
            model: this.salesContractModel,
            as: 'salesContract',
            include: [
              { model: this.sequelize.models.ShipmentType, as: 'shipmentType' },
            ],
          },
        ],
      })) as any;
      if (!pc) {
        throw new NotFoundException('Contract not found');
      }

      initialPurchaseContract = {
        id: pc.id,
        status: pc.status,
        contractNumber: pc.contract_number,
        freightRequired: evaluateFreightRequired(
          pc.shipmentType,
          pc.salesContract?.shipmentType,
        ).freightRequired,
        quantity: pc.quantity || null,
        placeOfLoading: pc.placeOfLoading ?? pc.place_of_loading ?? null,
        loadingCountry: pc.loadingCountry ?? pc.loading_country ?? null,
        deliveryPlace: pc.delivery_place || null,
        shipmentTypeId: pc.shipment_type_id || null,
        businessReference: pc.business_reference || null,
        buyerId: pc.buyer_id || null,
        sellerId: pc.seller_id || null,
        purchaseDate: pc.purchase_date || null,
      };

      const linkedSalesContract = pc.salesContract || null;
      const businessTransactionId =
        pc.businessTransactionId ?? linkedSalesContract?.businessTransactionId;

      if (linkedSalesContract?.enquiryId) {
        cleanEnquiryId = linkedSalesContract.enquiryId;
        enquiry = await this.enquiryModel.findOne({
          where: { id: cleanEnquiryId, companyId },
          include: [
            { model: Partner, as: 'partner' },
            { model: Product, as: 'product' },
            {
              model: TransportDetail,
              as: 'transportDetails',
              required: false,
            },
            {
              model: EnquiryDestination,
              as: 'destinations',
              attributes: ['destination'],
            },
          ],
        });
      }

      if (!enquiry && businessTransactionId != null) {
        enquiry = await this.enquiryModel.findOne({
          where: { businessTransactionId, ...(companyId ? { companyId } : {}) },
          include: [
            { model: Partner, as: 'partner' },
            { model: Product, as: 'product' },
            {
              model: TransportDetail,
              as: 'transportDetails',
              required: false,
            },
            {
              model: EnquiryDestination,
              as: 'destinations',
              attributes: ['destination'],
            },
          ],
        });
        if (enquiry) cleanEnquiryId = enquiry.id;
      }

      if (!enquiry) {
        // Standalone Purchase Contract workspace
        const quoteScope = targetShipmentId
          ? { where: { shipmentId: targetShipmentId }, required: false }
          : {};
        let pcLogistics = await this.logisticsModel.findOne({
          where: { purchaseContractId: pc.id },
          include: [
            {
              model: FreightQuote,
              as: 'quotes',
              ...quoteScope,
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
              ...quoteScope,
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
        });

        if (!pcLogistics) {
          if (!targetShipmentId && !initialPurchaseContract.freightRequired) {
            throw new BadRequestException(
              `Transport Management is not available for Purchase Contract #${pc.contract_number} because Freight is not required (Freight Required = NO).`,
            );
          }
          await this.sequelize.query(
            `CREATE SEQUENCE IF NOT EXISTS logistics_no_seq START 1;`,
          );
          const [seqRes]: any = await this.sequelize.query(
            `SELECT nextval('logistics_no_seq')`,
            { type: QueryTypes.SELECT } as any,
          );
          const nextVal = parseInt(
            seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
            10,
          );
          const currentYear = new Date().getFullYear();
          const logisticsNumber = `LOG/${currentYear}/${String(nextVal).padStart(6, '0')}`;

          pcLogistics = await this.logisticsModel.create({
            logisticsNumber,
            purchaseContractId: pc.id,
            businessTransactionId: pc.business_transaction_id ?? null,
            mode: 'Domestic',
            transportMode: 'Road',
            status: 'Pending',
          });
        }

        const loadingPoint =
          pc.placeOfLoading ?? pc.place_of_loading ?? null;
        const o =
          formatLogisticsLocation(
            loadingPoint,
            pc.loadingCountry ?? pc.loading_country,
          ) || '—';
        const d = pc.delivery_place || '—';
        let routes = targetShipmentId
          ? await this.findRoutesForShipment(
              pcLogistics.id,
              targetShipmentId,
            )
          : await this.logisticsRouteModel.findAll({
              where: { logisticsId: pcLogistics.id },
            });
        if (
          !targetShipmentId &&
          routes.length === 0 &&
          (o !== '—' || d !== '—')
        ) {
          const r = await this.logisticsRouteModel.create({
            logisticsId: pcLogistics.id,
            origin: o,
            destination: d,
          });
          routes = [r];
        } else if (
          !targetShipmentId &&
          loadingPoint &&
          o !== loadingPoint.trim()
        ) {
          const routeIds: number[] = [];
          for (const route of routes) {
            if (
              route.origin?.trim().toLowerCase() ===
              loadingPoint.trim().toLowerCase()
            ) {
              await route.update({ origin: o });
              routeIds.push(route.id);
            }
          }
          if (routeIds.length > 0) {
            await this.quoteModel.update(
              { origin: o },
              { where: { routeId: { [Op.in]: routeIds } } },
            );
          }
        }
        pcLogistics.setDataValue('routes', routes);

        let shipments: any[] = [];
        if (targetShipmentId) {
          const shipmentQuotes = await this.quoteModel.findAll({
            where: { shipmentId: targetShipmentId },
            include: [
              { model: this.partnerModel, as: 'seller' },
              { model: this.quoteChargeModel, as: 'charges' },
              {
                model: this.containerRateModel,
                as: 'containerRates',
                include: ['charges'],
              },
            ],
            order: [['createdAt', 'DESC']],
          });
          const quotes = shipmentQuotes.map((quote) =>
            quote.toJSON ? quote.toJSON() : quote,
          );
          const preferredQuote = quotes.find((quote) => quote.isPreferred) || null;
          shipments = [
            {
              id: targetShipment.id,
              shipmentNo: targetShipment.shipmentNo,
              shipmentReference:
                targetShipment.shipmentReference ||
                `REF-${String(targetShipment.id).padStart(5, '0')}`,
              shipmentDate: targetShipment.shipmentDate,
              quantity: Number(targetShipment.quantity || 0),
              noOfContainers: targetShipment.noOfContainers || 0,
              origin: o,
              destination: d,
              route: `${o} → ${d}`,
              commodity: '—',
              buyer: '—',
              supplier: '—',
              status: targetShipment.status,
              executionStatus: targetShipment.executionStatus || 'Pending',
              freight: preferredQuote
                ? preferredQuote.totalAmount || preferredQuote.freightAmount
                : targetShipment.freight || null,
              transitDays: preferredQuote ? preferredQuote.transitDays : null,
              transportPartner: preferredQuote?.seller
                ? {
                    id: preferredQuote.seller.id,
                    name: preferredQuote.seller.entityName,
                  }
                : null,
              preferredQuote,
              quotes,
              cargoReady: targetShipmentReadiness?.cargoReady ?? false,
              freightRequired:
                targetShipmentReadiness?.freightRequired ??
                false,
              freightReady: targetShipmentReadiness?.freightReady ?? false,
              freightAllocationStatus:
                targetShipmentReadiness?.freightAllocationStatus ?? 'No',
              readyForShipment:
                targetShipmentReadiness?.readyForShipment ?? false,
              reasons: targetShipmentReadiness?.reasons ?? [],
              isExecuted: ['Executed', 'Dispatched', 'Completed'].includes(
                targetShipment.status,
              ),
            },
          ];
        }

        return {
          enquiry: null,
          logistics: pcLogistics,
          salesContract: null,
          salesContractId: null,
          salesContractNumber: null,
          shipmentId: targetShipmentId || null,
          purchaseContract: initialPurchaseContract,
          shipments,
        };
      }
    }

    const quoteScope = targetShipmentId
      ? { where: { shipmentId: targetShipmentId }, required: false }
      : {};
    let logistics = await this.logisticsModel.findOne({
      where: { enquiryId: cleanEnquiryId },
      include: [
        {
          model: FreightQuote,
          as: 'quotes',
          ...quoteScope,
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
          ...quoteScope,
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

        // Infer Mode: Domestic ONLY if BOTH Origin AND Destination are India/domestic
        const originStr = (
          enquiry.originCountryId ||
          enquiry.originPort ||
          enquiry.originCity ||
          ''
        )
          .trim()
          .toLowerCase();
        const destStr = (
          enquiry.destinationCountry ||
          enquiry.destinationPort ||
          enquiry.destinationCity ||
          ''
        )
          .trim()
          .toLowerCase();

        let mode = 'International';
        const isOriginIndia = originStr.includes('india');
        const isDestIndia = destStr.includes('india');

        if (originStr && destStr) {
          if (isOriginIndia && isDestIndia) {
            mode = 'Domestic';
          } else if (isOriginIndia && !isDestIndia) {
            mode = 'Export';
          } else if (!isOriginIndia && isDestIndia) {
            mode = 'Import';
          } else {
            mode = 'Merchant Export';
          }
        }

        let transportMode = 'Road';
        if (enquiry.shipmentMode === 'SHIP') transportMode = 'Sea';
        else if (enquiry.shipmentMode === 'RAIL') transportMode = 'Rail';

        // Check Sales Contract if available for accurate trade type
        const scForMode = await this.findSalesContractForEnquiry(
          cleanEnquiryId,
          enquiry.businessTransactionId,
          {
            attributes: [
              'contractType',
              'originTransportMode',
              'originCountry',
              'destinationCountry',
            ],
            transaction,
          },
        );
        if (scForMode) {
          if (scForMode.contractType === 'Export') mode = 'Export';
          else if (scForMode.contractType === 'MTT') mode = 'Merchant Export';
          else if (scForMode.contractType === 'Domestic') mode = 'Domestic';
          else if (
            scForMode.originCountry &&
            scForMode.destinationCountry &&
            scForMode.originCountry !== scForMode.destinationCountry
          ) {
            mode = 'International';
          }

          if (scForMode.originTransportMode) {
            const ot = scForMode.originTransportMode.toLowerCase();
            if (ot === 'sea') transportMode = 'Sea';
            else if (ot === 'rail') transportMode = 'Rail';
            else if (ot === 'air') transportMode = 'Air';
            else if (ot === 'road') transportMode = 'Road';
          }
        }

        const createdLogistics = await this.logisticsModel.create(
          {
            logisticsNumber,
            enquiryId: cleanEnquiryId,
            businessTransactionId: enquiry.businessTransactionId ?? null,
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
            ...quoteScope,
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
            ...quoteScope,
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
    // Generate freight / logistics routes ONLY where FreightRequired = true
    const finalRoutes = targetShipmentId
      ? await this.findRoutesForShipment(logistics.id, targetShipmentId)
      : await this.syncLogisticsRoutesForEnquiry(cleanEnquiryId, companyId);

    // Attach routes to response
    logistics.setDataValue('routes', finalRoutes || []);

    // Look up if a SalesContract exists for this enquiry
    let salesContract = await this.findSalesContractForEnquiry(
      cleanEnquiryId,
      enquiry.businessTransactionId,
      {
        attributes: [
          'id',
          'contractNumber',
          'contractType',
          'originCountry',
          'destinationCountry',
          'originTransportMode',
          'destinationTransportMode',
          'originLocationName',
          'destinationLocationName',
          'portOfLoading',
          'portOfDischarge',
          'currencyCode',
          'buyerId',
          'sellerId',
        ],
        include: [
          { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
          { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
        ],
      },
    );

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

    // Look up if an associated PurchaseContract exists for this enquiry
    let purchaseContract: any = null;
    try {
      const pcConditions: string[] = [];
      const replacements: any = { companyId };
      if (salesContract) {
        pcConditions.push('pc.sales_contract_id = :salesContractId');
        replacements.salesContractId = salesContract.id;
      }
      if (enquiry.businessTransactionId) {
        pcConditions.push('pc.business_transaction_id = :businessTransactionId');
        replacements.businessTransactionId = enquiry.businessTransactionId;
      }
      if (pcConditions.length > 0) {
        const pcRows: any[] = await this.sequelize.query(
          `SELECT 
             pc.id,
             pc.status,
             pc.contract_number,
             pc.quantity,
             pc.place_of_loading,
             pc.loading_country,
             pc.delivery_place,
             pc.purchase_date,
             pc.sales_contract_id,
             pc.business_transaction_id,
             pc.shipment_type_id,
             pc.buyer_id,
             pc.seller_id,
             seller.entity_name AS seller_name,
             buyer.entity_name AS buyer_name,
             st.name AS shipment_type_name,
             st.code AS purchase_shipment_type_code,
             sc_st.code AS sales_shipment_type_code,
             bt.business_reference AS business_reference,
             pci.product_id AS pci_product_id,
             COALESCE(pci.product_name, prod.name) AS product_name
           FROM purchase_contracts pc
           LEFT JOIN partners seller ON pc.seller_id = seller.id
           LEFT JOIN partners buyer ON pc.buyer_id = buyer.id
           LEFT JOIN shipment_types st ON pc.shipment_type_id = st.id
           LEFT JOIN sales_contracts sc ON pc.sales_contract_id = sc.id
           LEFT JOIN shipment_types sc_st ON sc.shipment_type_id = sc_st.id
           LEFT JOIN business_transactions bt ON pc.business_transaction_id = bt.id
           LEFT JOIN LATERAL (
             SELECT product_id, product_name 
             FROM purchase_contract_items 
             WHERE purchase_contract_id = pc.id 
             ORDER BY id ASC LIMIT 1
           ) pci ON true
           LEFT JOIN products prod ON pci.product_id = prod.id
           WHERE (${pcConditions.join(' OR ')})
             AND (pc.company_id = :companyId OR pc.company_id IS NULL OR :companyId IS NULL)
           ORDER BY pc.updated_at DESC, pc.id DESC LIMIT 1`,
          {
            replacements,
            type: QueryTypes.SELECT,
          },
        );
        if (pcRows && pcRows.length > 0) {
          const pc = pcRows[0];
          purchaseContract = {
            id: pc.id,
            status: pc.status,
            contractNumber: pc.contract_number,
            freightRequired: evaluateFreightRequired(
              { code: pc.purchase_shipment_type_code },
              { code: pc.sales_shipment_type_code },
            ).freightRequired,
            quantity: pc.quantity || null,
            placeOfLoading: pc.place_of_loading || null,
            loadingCountry: pc.loading_country || null,
            deliveryPlace: pc.delivery_place || null,
            shipmentTypeId: pc.shipment_type_id || null,
            shipmentTypeName: pc.shipment_type_name || null,
            businessReference: pc.business_reference || null,
            buyerId: pc.buyer_id || null,
            buyerName: pc.buyer_name || null,
            productName: pc.product_name || null,
            productId: pc.pci_product_id || null,
            purchaseDate: pc.purchase_date || null,
            sellerId: pc.seller_id || null,
            sellerName: pc.seller_name || null,
          };
          if (!salesContract && pc.sales_contract_id) {
            salesContract = await this.salesContractModel.findByPk(
              pc.sales_contract_id,
              {
                include: [
                  {
                    model: Partner,
                    as: 'buyer',
                    attributes: ['id', 'entityName'],
                  },
                  {
                    model: Partner,
                    as: 'seller',
                    attributes: ['id', 'entityName'],
                  },
                ],
              },
            );
          }
        }
      }
    } catch (err) {
      console.error('Failed to look up purchase contract in getDetails:', err);
    }

    if (purchaseContract) {
      enquiry.setDataValue('purchaseContract', purchaseContract);
    }

    // ── Load All Shipments for this Purchase Contract / Sales Contract Deal ──
    const shipmentIdSet = new Set<number>();
    if (targetShipmentId) {
      // When opened for a single shipment execution, scope strictly to that target shipment
      shipmentIdSet.add(targetShipmentId);
    } else {
      if (purchaseContract?.id) {
        try {
          const pcLinks: any[] = await this.sequelize.query(
            `SELECT shipment_id FROM purchase_contract_shipments WHERE purchase_contract_id = :pcId`,
            {
              replacements: { pcId: purchaseContract.id },
              type: QueryTypes.SELECT,
            },
          );
          for (const row of pcLinks) {
            const sId = Number(row.shipment_id || row.shipmentId);
            if (sId) shipmentIdSet.add(sId);
          }
        } catch (err) {
          console.warn('Could not query purchase_contract_shipments:', err);
        }
      }

      if (salesContract?.id) {
        try {
          const scShipmentRows = await this.shipmentModel.findAll({
            where: { salesContractId: salesContract.id },
            attributes: ['id'],
          });
          for (const s of scShipmentRows) {
            shipmentIdSet.add(s.id);
          }
        } catch (err) {
          console.warn('Could not query salesContract shipments:', err);
        }
      }

      if (purchaseContract?.salesContractId) {
        try {
          const pcScShipmentRows = await this.shipmentModel.findAll({
            where: { salesContractId: purchaseContract.salesContractId },
            attributes: ['id'],
          });
          for (const s of pcScShipmentRows) {
            shipmentIdSet.add(s.id);
          }
        } catch (err) {
          console.warn(
            'Could not query purchaseContract.salesContractId shipments:',
            err,
          );
        }
      }

      if (logistics?.id) {
        try {
          const logShipments = await this.shipmentModel.findAll({
            where: { logisticsId: logistics.id },
            attributes: ['id'],
          });
          for (const s of logShipments) {
            shipmentIdSet.add(s.id);
          }
        } catch (err) {
          console.warn('Could not query logisticsId shipments:', err);
        }
      }
    }

    const allShipmentIds = Array.from(shipmentIdSet);
    let shipmentsList: any[] = [];

    if (allShipmentIds.length > 0) {
      const dbShipments = targetShipmentId
        ? [targetShipment]
        : await this.shipmentModel.findAll({
            where: { id: { [Op.in]: allShipmentIds } },
            order: [
              ['shipmentNo', 'ASC'],
              ['id', 'ASC'],
            ],
          });

      if (targetShipmentId) {
        const target = dbShipments.find((s) => s.id === targetShipmentId);
        if (!target) {
          throw new NotFoundException(
            `Selected shipment #${targetShipmentId} not found`,
          );
        }
        if (
          salesContract?.id &&
          target.salesContractId &&
          target.salesContractId !== salesContract.id
        ) {
          throw new NotFoundException(
            `Selected shipment #${targetShipmentId} not found in this contract`,
          );
        }
      }

      // Batch evaluate readiness
      const readinessMap = targetShipmentId
        ? new Map([[targetShipmentId, targetShipmentReadiness]])
        : await this.readinessService.evaluateBatch(dbShipments);

      // Batch load quotes linked to these shipments
      const quotesForShipments = await this.quoteModel.findAll({
        where: targetShipmentId
          ? { shipmentId: targetShipmentId }
          : { shipmentId: { [Op.in]: allShipmentIds } },
        include: [
          { model: this.partnerModel, as: 'seller' },
          { model: this.quoteChargeModel, as: 'charges' },
          {
            model: this.containerRateModel,
            as: 'containerRates',
            include: ['charges'],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      const quotesByShipment = new Map<number, any[]>();
      for (const q of quotesForShipments) {
        if (!q.shipmentId) continue;
        if (!quotesByShipment.has(q.shipmentId)) {
          quotesByShipment.set(q.shipmentId, []);
        }
        quotesByShipment.get(q.shipmentId).push(q.toJSON ? q.toJSON() : q);
      }

      // Auto Route Source Mapping (Purchase Contract → Sales Contract)
      // Origin: ALWAYS Purchase Contract → Place of Loading
      const defaultOrigin =
        formatLogisticsLocation(
          purchaseContract?.placeOfLoading,
          purchaseContract?.loadingCountry,
        ) ||
        (enquiry as any)?.transportDetails?.[0]?.origin ||
        enquiry?.originPort ||
        enquiry?.originCity ||
        '—';
      // Destination: ALWAYS Linked Sales Contract → Delivery Place
      const defaultDestination =
        (salesContract as any)?.transportDetails?.[0]?.destination ||
        salesContract?.destinationLocationName ||
        salesContract?.portOfDischarge ||
        salesContract?.deliveryPlace ||
        (enquiry as any)?.transportDetails?.[0]?.destination ||
        enquiry?.destinations?.[0]?.destination ||
        enquiry?.destinationPort ||
        enquiry?.destinationCity ||
        '—';

      shipmentsList = dbShipments
        .filter((s) => {
          const readiness = readinessMap.get(s.id);
          const isFreightReq = readiness?.freightRequired ?? false;
          return isFreightReq;
        })
        .map((s) => {
        const sQuotes = quotesByShipment.get(s.id) || [];
        const preferredQuote = sQuotes.find((q) => q.isPreferred) || null;
        const readiness = readinessMap.get(s.id);

        return {
          id: s.id,
          shipmentNo: s.shipmentNo,
          shipmentReference:
            s.shipmentReference || `REF-${String(s.id).padStart(5, '0')}`,
          shipmentDate: s.shipmentDate,
          quantity: Number(s.quantity || 0),
          noOfContainers: s.noOfContainers || 0,
          origin: defaultOrigin,
          destination: defaultDestination,
          route: `${defaultOrigin} → ${defaultDestination}`,
          commodity:
            purchaseContract?.productName || enquiry?.product?.name || '—',
          buyer: salesContract?.buyer?.entityName || '—',
          supplier: purchaseContract?.sellerName || '—',
          status: s.status,
          executionStatus: s.executionStatus || 'Pending',
          freight: preferredQuote
            ? preferredQuote.totalAmount || preferredQuote.freightAmount
            : s.freight || null,
          transitDays: preferredQuote ? preferredQuote.transitDays : null,
          transportPartner: preferredQuote?.seller
            ? {
              id: preferredQuote.seller.id,
              name: preferredQuote.seller.entityName,
            }
            : null,
          preferredQuote,
          quotes: sQuotes,
          cargoReady: readiness?.cargoReady ?? false,
          freightRequired: readiness?.freightRequired ?? false,
          freightReady: readiness?.freightReady ?? false,
          freightAllocationStatus: readiness?.freightAllocationStatus ?? 'No',
          readyForShipment: readiness?.readyForShipment ?? false,
          reasons: readiness?.reasons ?? [],
          isExecuted: ['Executed', 'Dispatched', 'Completed'].includes(
            s.status,
          ),
        };
      });
    }

    return {
      enquiry,
      logistics,
      salesContract: salesContract ? salesContract.toJSON() : null,
      salesContractId: salesContract ? salesContract.id : null,
      salesContractNumber: salesContract ? salesContract.contractNumber : null,
      shipmentId: targetShipmentId || shipmentId,
      purchaseContract,
      shipments: shipmentsList,
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
      const seller = await Partner.findOne({
        where: { id: dto.sellerId, companyId },
      });
      if (!seller)
        throw new BadRequestException(
          'Seller not found or does not belong to company',
        );
    }

    if (dto.shipmentId) {
      const targetShipment = await this.shipmentModel.findByPk(dto.shipmentId, {
        include: [
          {
            model: this.salesContractModel,
            as: 'salesContract',
            include: [{ model: this.sequelize.models.ShipmentType, as: 'shipmentType' }],
          },
        ],
      });
      if (targetShipment) {
        const readiness = await this.readinessService.evaluate(targetShipment);
        const isFreightReq = readiness?.freightRequired ?? false;
        if (!isFreightReq) {
          throw new BadRequestException(
            `Cannot add freight quote for Shipment #${dto.shipmentId} because Freight is not required for this shipment (Freight Required = NO).`,
          );
        }
      }
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

      const resolvedPt = await this.resolvePaymentTerm(
        dto.paymentTermId,
        dto.paymentTerms,
        user,
        companyId,
      );

      const quote = await this.quoteModel.create(
        {
          ...dto,
          origin: dto.origin || dto.loadingPoint || null,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
          quoteNumber,
          logisticsId,
          shipmentId: dto.shipmentId || null,
          purchaseContractId:
            dto.purchaseContractId || logistics.purchaseContractId || null,
          businessTransactionId: logistics.businessTransactionId ?? null,
          createdBy: user?.userId,
          routeId: dto.routeId || null,
          paymentTermId: resolvedPt.paymentTermId,
          paymentTerms: resolvedPt.paymentTerms,
        } as any,
        { transaction },
      );

      // Immediately mark shipment Freight Allocation as 'Yes' upon freight quote creation ONLY for this specific shipment
      if (dto.shipmentId) {
        const targetShipment = await this.shipmentModel.findByPk(
          dto.shipmentId,
          { transaction },
        );
        if (targetShipment) {
          await targetShipment.update(
            {
              logisticsId,
              freightAllocationStatus: 'Yes',
              freight: targetShipment.freight || calculatedFreightAmount,
            },
            { transaction },
          );
        }
      }

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
              chargeDate: c.chargeDate || null,
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
          chargeDate: c.chargeDate || null,
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
          { model: PaymentTerm, as: 'paymentTerm' },
        ],
        transaction,
      });
    });
  }

  async createDirectFreightQuote(
    dto: CreateFreightQuoteDto,
    user: any,
    companyId: number = 1,
  ) {
    if (dto.sellerId) {
      const seller = await Partner.findOne({
        where: { id: dto.sellerId, companyId },
      });
      if (!seller)
        throw new BadRequestException(
          'Seller not found or does not belong to company',
        );
    }

    if (dto.shipmentId) {
      const targetShipment = await this.shipmentModel.findByPk(dto.shipmentId, {
        include: [
          {
            model: this.salesContractModel,
            as: 'salesContract',
            include: [{ model: this.sequelize.models.ShipmentType, as: 'shipmentType' }],
          },
        ],
      });
      if (targetShipment) {
        const readiness = await this.readinessService.evaluate(targetShipment);
        const isFreightReq = readiness?.freightRequired ?? false;
        if (!isFreightReq) {
          throw new BadRequestException(
            `Cannot add freight quote for Shipment #${dto.shipmentId} because Freight is not required for this shipment (Freight Required = NO).`,
          );
        }
      }
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

      const resolvedPt = await this.resolvePaymentTerm(
        dto.paymentTermId,
        dto.paymentTerms,
        user,
        companyId,
      );

      const quote = await this.quoteModel.create(
        {
          ...dto,
          origin: dto.origin || dto.loadingPoint || null,
          sellerId: dto.sellerId,
          freightAmount: calculatedFreightAmount,
          quoteNumber,
          isDirect: true,
          companyId,
          createdBy: user?.userId,
          paymentTermId: resolvedPt.paymentTermId,
          paymentTerms: resolvedPt.paymentTerms,
        } as any,
        { transaction },
      );

      // Immediately mark shipment Freight Allocation as 'Yes' upon freight quote creation
      if (dto.shipmentId) {
        const targetShipment = await this.shipmentModel.findByPk(
          dto.shipmentId,
          { transaction },
        );
        if (targetShipment) {
          await targetShipment.update(
            {
              freightAllocationStatus: 'Yes',
              freight: targetShipment.freight || calculatedFreightAmount,
            },
            { transaction },
          );
        }
      }

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
                chargeDate: c.chargeDate || null,
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
            chargeDate: c.chargeDate || null,
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
          { model: PaymentTerm, as: 'paymentTerm' },
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

  async deleteDirectFreightQuote(
    quoteId: number,
    user: any,
    companyId: number = 1,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, isDirect: true },
    });
    if (!quote) {
      throw new NotFoundException('Direct freight quote not found');
    }

    if (quote.isPreferred) {
      throw new BadRequestException('Cannot delete preferred quote.');
    }

    await this.sequelize.transaction(async (transaction) => {
      await quote.destroy({ transaction });

      if (quote.shipmentId) {
        const remainingQuotesCount = await this.quoteModel.count({
          where: {
            shipmentId: quote.shipmentId,
            isRejected: false,
          },
          transaction,
        });
        if (remainingQuotesCount === 0) {
          const shipment = await this.shipmentModel.findByPk(quote.shipmentId, {
            transaction,
          });
          if (shipment) {
            await shipment.update(
              {
                freightAllocationStatus: 'No',
                freight: null,
              },
              { transaction },
            );
          }
        }
      }

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
      const resolvedPt = await this.resolvePaymentTerm(
        dto.paymentTermId,
        dto.paymentTerms,
        user,
        companyId,
      );

      // 1. Update quote basic details
      await quote.update(
        {
          productId: dto.productId,
          quoteDate: dto.quoteDate,
          origin: dto.origin || dto.loadingPoint || quote.origin,
          destination: dto.destination || quote.destination,
          paymentTermId: resolvedPt.paymentTermId,
          paymentTerms: resolvedPt.paymentTerms,
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
    if (
      dto.shipmentId &&
      Number(quote.shipmentId) !== Number(dto.shipmentId)
    ) {
      throw new NotFoundException('Freight quote not found for this shipment');
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

    if (dto.shipmentId) {
      const targetShipment = await this.shipmentModel.findByPk(dto.shipmentId, {
        include: [
          {
            model: this.salesContractModel,
            as: 'salesContract',
            include: [{ model: this.sequelize.models.ShipmentType, as: 'shipmentType' }],
          },
        ],
      });
      if (targetShipment) {
        const readiness = await this.readinessService.evaluate(targetShipment);
        const isFreightReq = readiness?.freightRequired ?? false;
        if (!isFreightReq) {
          throw new BadRequestException(
            `Cannot add freight quote for Shipment #${dto.shipmentId} because Freight is not required for this shipment (Freight Required = NO).`,
          );
        }
      }
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

      const resolvedPt = await this.resolvePaymentTerm(
        dto.paymentTermId,
        dto.paymentTerms,
        user,
        companyId,
      );

      await quote.update(
        {
          ...dto,
          freightAmount: calculatedFreightAmount,
          version: newVersion,
          updatedBy: user?.userId,
          routeId: dto.routeId || null,
          paymentTermId: resolvedPt.paymentTermId,
          paymentTerms: resolvedPt.paymentTerms,
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
              chargeDate: c.chargeDate || null,
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
          chargeDate: c.chargeDate || null,
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
        { model: PaymentTerm, as: 'paymentTerm' },
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
    shipmentId?: number,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId, ...(shipmentId ? { shipmentId } : {}) },
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

      if (quote.shipmentId) {
        const remainingQuotesCount = await this.quoteModel.count({
          where: {
            shipmentId: quote.shipmentId,
            isRejected: false,
          },
          transaction,
        });
        if (remainingQuotesCount === 0) {
          const shipment = await this.shipmentModel.findByPk(quote.shipmentId, {
            transaction,
          });
          if (shipment) {
            await shipment.update(
              {
                freightAllocationStatus: 'No',
                freight: null,
              },
              { transaction },
            );
          }
        }
      }

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
    shipmentId?: number,
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId, ...(shipmentId ? { shipmentId } : {}) },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    if (quote.shipmentId) {
      const shipment = await this.shipmentModel.findByPk(quote.shipmentId);
      if (!shipment) {
        throw new NotFoundException(`Shipment #${quote.shipmentId} not found`);
      }
      const readiness = await this.readinessService.evaluate(shipment);
      if (!readiness.freightRequired) {
        throw new BadRequestException(
          `Cannot allocate freight for Shipment #${quote.shipmentId} because Freight Required = NO.`,
        );
      }
    }

    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    await this.sequelize.transaction(async (transaction) => {
      const oldStatus = logistics.status;
      if (quote.shipmentId) {
        // 1. Unmark other quotes for THIS specific shipment
        await this.quoteModel.update(
          { isPreferred: false, isRejected: true },
          { where: { shipmentId: quote.shipmentId }, transaction },
        );

        // 2. Mark this quote as preferred
        await quote.update(
          { isPreferred: true, isRejected: false },
          { transaction },
        );

        // 3. Update the specific shipment with selected freight amount & logistics link
        const shipment = await this.shipmentModel.findByPk(quote.shipmentId, {
          transaction,
        });
        if (shipment) {
          await shipment.update(
            {
              freight: quote.totalAmount || quote.freightAmount,
              logisticsId,
              freightAllocationStatus: 'Yes',
            },
            { transaction },
          );
        }

        // 4. Update logistics header
        await logistics.update(
          {
            selectedFreightId: quote.id,
            status: 'Preferred Quote Selected',
            updatedBy: user?.userId,
          },
          { transaction },
        );
      } else {
        // Fallback for legacy quotes without shipmentId
        const routeCondition = quote.routeId ? { routeId: quote.routeId } : {};

        await this.quoteModel.update(
          { isPreferred: false, isRejected: true },
          { where: { logisticsId, ...routeCondition }, transaction },
        );

        await quote.update(
          { isPreferred: true, isRejected: false },
          { transaction },
        );

        await logistics.update(
          {
            selectedFreightId: quote.id,
            status: 'Preferred Quote Selected',
            updatedBy: user?.userId,
          },
          { transaction },
        );
      }

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

    const completesAllocation = isTransportAllocationComplete(dto.status);
    const selectedQuote = logistics.selectedFreightId
      ? await this.quoteModel.findByPk(logistics.selectedFreightId)
      : null;
    if (
      completesAllocation &&
      (!selectedQuote ||
        selectedQuote.logisticsId !== logisticsId ||
        selectedQuote.isPreferred !== true ||
        selectedQuote.isRejected === true)
    ) {
      throw new BadRequestException(
        'Select a valid preferred freight quote before assigning transport.',
      );
    }

    const assignedShipment = selectedQuote?.shipmentId
      ? await this.shipmentModel.findByPk(selectedQuote.shipmentId)
      : null;
    if (completesAllocation && assignedShipment) {
      const readiness = await this.readinessService.evaluate(assignedShipment);
      if (!readiness.freightRequired) {
        throw new BadRequestException(
          `Cannot assign transport for Shipment #${assignedShipment.id} because Freight Required = NO.`,
        );
      }
    }

    await this.sequelize.transaction(async (transaction) => {
      const oldStatus = logistics.status;
      const updates: any = { ...dto, updatedBy: user?.userId };

      await logistics.update(updates, { transaction });

      if (assignedShipment) {
        await assignedShipment.update(
          {
            logisticsId,
            freightAllocationStatus: completesAllocation ? 'Yes' : 'No',
          },
          { transaction },
        );
      }

      if (dto.transportMode && logistics.enquiryId) {
        const modeMap: Record<string, string> = {
          Sea: 'SHIP',
          Road: 'ROAD',
          Rail: 'RAIL',
        };
        const mappedMode = modeMap[dto.transportMode];
        if (mappedMode) {
          await this.enquiryModel.update(
            { shipmentMode: mappedMode as any },
            { where: { id: logistics.enquiryId }, transaction },
          );
        }
      }

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

    if (!isTransportAllocationComplete(logistics.status)) {
      throw new BadRequestException(
        'Assign transport before generating a shipment.',
      );
    }

    // Lookup Sales Contract linked via ForeignKey enquiryId
    const salesContract = await this.findSalesContractForEnquiry(
      logistics.enquiryId,
      logistics.businessTransactionId,
      {
        include: [
          { model: SalesContractShipment },
          { model: this.sequelize.models.ShipmentType, as: 'shipmentType' },
        ],
      },
    );

    if (!salesContract) {
      throw new BadRequestException(
        'No executed Sales Contract found for this enquiry. Please execute the Sales Contract first.',
      );
    }

    const purchaseShipmentTypes: any[] = await this.sequelize.query(
      `SELECT st.id, st.code
       FROM purchase_contracts pc
       JOIN shipment_types st ON st.id = pc.shipment_type_id
       WHERE pc.sales_contract_id = :salesContractId
          OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :businessTransactionId)
       ORDER BY pc.updated_at DESC, pc.id DESC
       LIMIT 1`,
      {
        replacements: {
          salesContractId: salesContract.id,
          businessTransactionId: salesContract.businessTransactionId || -1,
        },
        type: QueryTypes.SELECT,
      },
    );
    const freightRequired = evaluateFreightRequired(
      purchaseShipmentTypes[0] || null,
      (salesContract as any).shipmentType || null,
    ).freightRequired;
    if (!freightRequired) {
      throw new BadRequestException(
        'Cannot generate a shipment when Freight Required = NO.',
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
          companyId: salesContract.companyId || companyId || null,
          businessTransactionId:
            salesContract.businessTransactionId ??
            logistics.businessTransactionId ??
            null,
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
          freightRequired,
          freightAllocationStatus: 'No',
        },
        { transaction },
      );

      await quote.update({ shipmentId: shipment.id }, { transaction });
      await shipment.update({ freightAllocationStatus: 'Yes' }, { transaction });

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

  /**
   * Resolve and initialize the Transport Workspace for exactly one shipment.
   * This endpoint is for direct deep links and never depends on the logistics queue.
   */
  async getShipmentWorkspace(
    shipmentId: number,
    user: any,
    companyId: number = 1,
  ) {
    const shipment = await this.shipmentModel.findByPk(shipmentId, {
      include: [
        {
          model: this.salesContractModel,
          as: 'salesContract',
        },
      ],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    if (
      user?.companyId &&
      shipment.companyId !== user.companyId &&
      shipment.salesContract?.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    const readiness = await this.readinessService.evaluate(shipment);
    if (!(readiness?.freightRequired ?? false)) {
      throw new BadRequestException(
        `Transport Management is not available for Shipment #${shipmentId} because Freight is not required (Freight Required = NO).`,
      );
    }

    const salesContractEnquiryId = shipment.salesContract?.enquiryId;
    if (salesContractEnquiryId) {
      const details = await this.getDetails(
        salesContractEnquiryId,
        companyId,
        shipmentId,
      );
      return {
        ...details,
        workspaceMode: 'single-shipment',
        shipmentId,
        enquiryId: salesContractEnquiryId,
      };
    }

    const [purchaseContractRows]: any = await this.sequelize.query(
      `SELECT pc.id
       FROM purchase_contracts pc
       LEFT JOIN purchase_contract_shipments pcs ON pcs.purchase_contract_id = pc.id
       WHERE pcs.shipment_id = :shipmentId
          OR (pc.sales_contract_id IS NOT NULL AND pc.sales_contract_id = :salesContractId)
          OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :businessTransactionId)
       ORDER BY CASE WHEN pcs.shipment_id = :shipmentId THEN 1 ELSE 2 END,
                pc.updated_at DESC
       LIMIT 1`,
      {
        replacements: {
          shipmentId,
          salesContractId: shipment.salesContractId || -1,
          businessTransactionId: shipment.businessTransactionId || -1,
        },
        type: QueryTypes.SELECT,
      },
    );

    const purchaseContractId = Number(
      purchaseContractRows?.pc_id ?? purchaseContractRows?.id,
    );
    if (!Number.isSafeInteger(purchaseContractId) || purchaseContractId <= 0) {
      throw new NotFoundException(
        `No Purchase Contract or enquiry context found for Shipment #${shipmentId}`,
      );
    }

    const details = await this.getDetails(
      `pc_${purchaseContractId}`,
      companyId,
      shipmentId,
    );
    return {
      ...details,
      workspaceMode: 'single-shipment',
      shipmentId,
      enquiryId: `pc_${purchaseContractId}`,
    };
  }

  /**
   * Execute an individual shipment independently.
   * Executing one shipment does NOT affect any other shipment under the same Purchase Contract.
   */
  async executeShipment(shipmentId: number, user: any, companyId: number = 1) {
    const shipment = await this.shipmentModel.findByPk(shipmentId);
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    if (
      ['Executed', 'Stuffed', 'Dispatched', 'Completed'].includes(
        shipment.status,
      )
    ) {
      throw new BadRequestException('Shipment is already executed.');
    }

    const readiness = await this.readinessService.evaluate(shipment);
    if (!readiness.readyForShipment) {
      throw new BadRequestException(
        readiness.reasons && readiness.reasons.length > 0
          ? readiness.reasons.join(' ')
          : 'Shipment cannot be executed until cargo and freight allocations are ready.',
      );
    }

    return await this.shipmentService.update(
      shipmentId,
      { status: 'Executed' },
      user,
    );
  }
}
