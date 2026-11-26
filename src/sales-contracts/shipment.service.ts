import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize, Transaction } from 'sequelize';
import { Sequelize as SequelizeConnection } from 'sequelize-typescript';
import ExcelJS from 'exceljs';
import { SalesContractShipment } from './models/sales-contract-shipment.model';
import { SalesContract } from './models/sales-contract.model';
import { Partner } from '../masters/partner/partner.model';
import { SalesContractItem } from './models/sales-contract-item.model';
import { Product } from '../masters/product/product.model';
import { SalesContractDocument } from './models/sales-contract-document.model';
import { SalesContractDocumentFile } from './models/sales-contract-document-file.model';
import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateManualReadinessDto } from './dto/update-manual-readiness.dto';
import { generateShipmentReference } from './utils/shipment-reference.util';
import { PurchaseContractService } from '../purchase-contracts/services/purchase-contract.service';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import {
  isBusinessReferenceSearch,
  resolveBusinessTransactionId,
} from '../system/utils/business-reference-query.util';
import { ShipmentReadinessService } from './services/shipment-readiness.service';
import { AuditService } from '../audit/services/audit.service';
import { User } from '../users/models/user.model';
import {
  ShipmentDowntime,
  ShipmentStuffing,
} from './models/shipment-stuffing.model';
import { Logistics } from '../logistics/models/logistics.model';
import { FreightQuote } from '../logistics/models/freight-quote.model';
import { Company } from '../companies/models/company.model';
import { Enquiry } from '../enquiries/models/enquiry.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { evaluateFreightRequired } from '../masters/shipment-type/freight-rule-engine.service';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';
import { StockService } from '../stock/stock.service';
import { assertCanModifyRecord } from '../rbac/utils/finalization-lock.util';
import { Attachment } from '../attachments/models/attachment.model';
import {
  distributeMultiShipmentWeights,
  getMultiExecutionTransportCategory,
  parseMultiExecutionShipmentIds,
} from './utils/multi-stuffing-execution.util';

function getContractDestination(contract: SalesContract): string | null {
  if (contract.destinationSelectionMode === 'enquiry') {
    return contract.enquiryDestination || null;
  }
  return (
    contract.destinationLocationName ||
    contract.portOfDischarge ||
    contract.deliveryPlace ||
    null
  );
}

@Injectable()
export class ShipmentService {
  constructor(
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(SalesContract)
    private readonly contractModel: typeof SalesContract,
    @InjectModel(SalesContractItem)
    private readonly itemModel: typeof SalesContractItem,
    @InjectModel(SalesContractDocument)
    private readonly docModel: typeof SalesContractDocument,
    @InjectModel(SalesContractDocumentFile)
    private readonly docFileModel: typeof SalesContractDocumentFile,
    @Inject(forwardRef(() => PurchaseContractService))
    private readonly purchaseContractService: PurchaseContractService,
    @Inject(forwardRef(() => StockService))
    private readonly stockService: StockService,
    private readonly readinessService: ShipmentReadinessService,
    private readonly auditService: AuditService,
    @InjectModel(ShipmentStuffing)
    private readonly stuffingModel: typeof ShipmentStuffing,
    @InjectModel(Attachment)
    private readonly attachmentModel: typeof Attachment,
    @InjectModel(Logistics)
    private readonly logisticsModel: typeof Logistics,
    @InjectModel(FreightQuote)
    private readonly freightQuoteModel: typeof FreightQuote,
    @InjectConnection()
    private readonly sequelize: SequelizeConnection,
  ) {}

  private stripRemovedContainerFields(
    containers: Array<Record<string, unknown>> | null | undefined,
  ): Array<Record<string, unknown>> {
    return (containers || []).map(
      ({ vehicleNumber, stuffingDate, warehouse, status, ...container }) =>
        container,
    );
  }

  private normalizeDowntimeRecords(records: unknown): ShipmentDowntime[] {
    if (!Array.isArray(records)) return [];

    return records.map((record, index) => {
      if (
        typeof record !== 'object' ||
        record === null ||
        Array.isArray(record)
      ) {
        throw new BadRequestException(
          `Downtime record ${index + 1} must be an object.`,
        );
      }

      const values = record as Record<string, unknown>;
      const readText = (field: string) =>
        typeof values[field] === 'string' ? values[field].trim() : '';
      const rawPrice = values.price;
      const price =
        typeof rawPrice === 'number'
          ? rawPrice
          : typeof rawPrice === 'string' && rawPrice.trim()
            ? Number(rawPrice.trim())
            : Number.NaN;
      const currency = readText('currency');
      const reason = readText('reason');
      const fromDate = readText('fromDate');
      const toDate = readText('toDate');
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const isValidDate = (value: string) => {
        if (!datePattern.test(value)) return false;
        const parsedDate = new Date(`${value}T00:00:00.000Z`);
        return (
          !Number.isNaN(parsedDate.getTime()) &&
          parsedDate.toISOString().slice(0, 10) === value
        );
      };

      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException(
          `Downtime record ${index + 1}: Price must be greater than 0.`,
        );
      }
      if (!currency) {
        throw new BadRequestException(
          `Downtime record ${index + 1}: Currency is required.`,
        );
      }
      if (
        (fromDate && !isValidDate(fromDate)) ||
        (toDate && !isValidDate(toDate))
      ) {
        throw new BadRequestException(
          `Downtime record ${index + 1} dates must use YYYY-MM-DD format.`,
        );
      }
      if (fromDate && toDate && fromDate > toDate) {
        throw new BadRequestException(
          `Downtime record ${index + 1}: From Date cannot be later than To Date.`,
        );
      }

      let duration = '';
      if (fromDate && toDate) {
        const totalDays =
          (Date.parse(`${toDate}T00:00:00.000Z`) -
            Date.parse(`${fromDate}T00:00:00.000Z`)) /
          86400000;
        duration = `${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
      }

      return {
        price,
        currency,
        reason,
        customReason: reason === 'Other' ? readText('customReason') : '',
        fromDate,
        toDate,
        duration,
        remarks: readText('remarks'),
      };
    });
  }

  public async ensureExecutionRecordsForShipmentId(
    shipmentId: number,
    userId?: number | null,
  ): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      // Lock shipment row first to prevent race conditions
      const locked = await this.shipmentModel.findByPk(shipmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!locked) return;

      // Query with associations without lock to avoid PostgreSQL outer join lock error
      const shipment = await this.shipmentModel.findByPk(shipmentId, {
        include: [
          {
            model: SalesContract,
            as: 'salesContract',
            include: [
              { model: Partner, as: 'buyer' },
              { model: Partner, as: 'seller' },
              {
                model: SalesContractItem,
                as: 'items',
                include: [
                  { model: Product, as: 'product' },
                  { model: PackingType, as: 'packingType' },
                ],
              },
            ],
          },
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
          },
        ],
        transaction,
      });

      if (!shipment) return;
      if (
        shipment.status !== 'Executed' &&
        !['Stuffed', 'Dispatched', 'Completed'].includes(shipment.status)
      ) {
        shipment.status = 'Executed';
      }
      shipment.executionStatus = shipment.executionStatus || 'Pending';
      await shipment.save({ transaction });

      await this.ensureExecutionRecords(shipment, transaction, userId ?? null);
    });
  }

  public async ensureExecutionRecords(
    shipment: SalesContractShipment,
    transaction: Transaction,
    userId: number | null,
  ): Promise<void> {
    // 1. Resolve Company ID and Business Transaction ID
    let resolvedCompanyId =
      shipment.companyId ?? shipment.salesContract?.companyId ?? null;
    let resolvedBusinessTxId =
      shipment.businessTransactionId ??
      shipment.salesContract?.businessTransactionId ??
      null;

    if (
      (!resolvedCompanyId || !resolvedBusinessTxId) &&
      shipment.salesContractId
    ) {
      const sc = await this.contractModel.findByPk(shipment.salesContractId, {
        attributes: [
          'id',
          'companyId',
          'businessTransactionId',
          'contractNumber',
        ],
        transaction,
      });
      if (sc) {
        if (!resolvedCompanyId) resolvedCompanyId = sc.companyId;
        if (!resolvedBusinessTxId)
          resolvedBusinessTxId = sc.businessTransactionId;
      }
    }

    if (!shipment.companyId && resolvedCompanyId) {
      shipment.companyId = resolvedCompanyId;
    }
    if (!shipment.businessTransactionId && resolvedBusinessTxId) {
      shipment.businessTransactionId = resolvedBusinessTxId;
    }

    // 2. Prepare Auto-Populated Snapshot
    const salesContract = shipment.salesContract;
    const firstItem = salesContract?.items?.[0];
    const autoPopulatedData: any = {
      shipmentRef: shipment.shipmentReference || `Shipment #${shipment.id}`,
      shipmentNo: shipment.shipmentNo,
      shipmentDate: shipment.shipmentDate,
      quantityMt: Number(shipment.quantity || 0),
      noOfContainers: shipment.noOfContainers || 1,
      businessRefNo:
        shipment.businessTransaction?.businessReference ||
        salesContract?.businessTransaction?.businessReference ||
        'N/A',
      salesContractNo: salesContract?.contractNumber || 'N/A',
      buyerName: salesContract?.buyer?.entityName || 'N/A',
      sellerCompany: salesContract?.seller?.entityName || 'N/A',
      product: firstItem?.product?.name || 'Agri Commodity',
      commodityGrade:
        (firstItem?.product as any)?.grade ||
        firstItem?.remarks ||
        'Standard Export Grade',
      packingType: firstItem?.packingType?.name || 'Standard Bags',
      allocatedWeight: Number(shipment.quantity || 0),
      balanceWeight: 0,
      warehouse: 'Main Warehouse',
      ratePerMt: Number(shipment.ratePerMt || 0),
      freight: Number(shipment.freight || 0),
    };

    // 4. Ensure ShipmentStuffing Record
    let stuffing = await this.stuffingModel.findOne({
      where: { shipmentId: shipment.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!stuffing) {
      stuffing = await this.stuffingModel.create(
        {
          companyId: resolvedCompanyId,
          shipmentId: shipment.id,
          salesContractId: shipment.salesContractId,
          stuffingStatus: 'Pending',
          executionStatus: 'Pending',
          warehouseStatus: 'Pending',
          loadingStatus: 'Pending',
          autoPopulatedData,
          createdBy: userId,
          remarks: 'Initialized automatically from Shipment Execution.',
        },
        { transaction },
      );
    } else {
      let stuffingUpdated = false;
      if (!stuffing.companyId && resolvedCompanyId) {
        stuffing.companyId = resolvedCompanyId;
        stuffingUpdated = true;
      }
      if (!stuffing.salesContractId && shipment.salesContractId) {
        stuffing.salesContractId = shipment.salesContractId;
        stuffingUpdated = true;
      }
      if (
        stuffing.stuffingStatus === 'Draft' ||
        stuffing.executionStatus === 'Draft'
      ) {
        stuffing.stuffingStatus = 'Pending';
        stuffing.executionStatus = 'Pending';
        stuffingUpdated = true;
      }
      if (
        !stuffing.autoPopulatedData ||
        Object.keys(stuffing.autoPopulatedData).length === 0
      ) {
        stuffing.autoPopulatedData = autoPopulatedData;
        stuffingUpdated = true;
      }
      if (stuffingUpdated) {
        await stuffing.save({ transaction });
      }
    }
  }

  private calculateTimeline(shipmentDateStr: string | Date, status: string) {
    if (status === 'Delivered') {
      return {
        label: 'Delivered',
        color: 'black',
        days: 0,
        type: 'completed',
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(shipmentDateStr);
    targetDate.setHours(0, 0, 0, 0);

    const timeDiff = targetDate.getTime() - today.getTime();
    const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

    if (status === 'Cancelled') {
      return {
        label: 'Cancelled',
        color: 'gray',
        days: daysDiff,
        type: 'cancelled',
      };
    }

    if (daysDiff === 0) {
      return { label: 'Today', color: 'green', days: 0, type: 'today' };
    } else if (daysDiff === 1) {
      return { label: 'Tomorrow', color: 'blue', days: 1, type: 'tomorrow' };
    } else if (daysDiff > 1) {
      const color = daysDiff <= 7 ? 'blue' : 'orange';
      return {
        label: `In ${daysDiff} Days`,
        color,
        days: daysDiff,
        type: 'upcoming',
      };
    } else {
      return {
        label: `Overdue ${Math.abs(daysDiff)} Days`,
        color: 'red',
        days: daysDiff,
        type: 'overdue',
      };
    }
  }

  private getExecutedCondition() {
    return {
      [Op.or]: [
        {
          status: {
            [Op.in]: ['Executed', 'Stuffed', 'Dispatched', 'Completed'],
          },
        },
        {
          executionStatus: {
            [Op.in]: [
              'Executed',
              'Stuffed',
              'Loading Completed',
              'Dispatched',
              'Completed',
            ],
          },
        },
        Sequelize.literal(`EXISTS (
          SELECT 1 FROM shipment_stuffings ss 
          WHERE ss.shipment_id = "SalesContractShipment"."id" 
          AND (ss.stuffing_status IN ('Completed', 'Stuffed') OR ss.execution_status IN ('Executed', 'Stuffed', 'Loading Completed', 'Completed', 'Dispatched'))
        )`),
      ],
    };
  }

  private getPendingCondition() {
    return {
      [Op.and]: [
        {
          [Op.or]: [
            { status: null },
            {
              status: {
                [Op.notIn]: ['Executed', 'Stuffed', 'Dispatched', 'Completed'],
              },
            },
          ],
        },
        {
          [Op.or]: [
            { executionStatus: null },
            {
              executionStatus: {
                [Op.notIn]: [
                  'Executed',
                  'Stuffed',
                  'Loading Completed',
                  'Dispatched',
                  'Completed',
                ],
              },
            },
          ],
        },
        Sequelize.literal(`NOT EXISTS (
          SELECT 1 FROM shipment_stuffings ss 
          WHERE ss.shipment_id = "SalesContractShipment"."id" 
          AND (ss.stuffing_status IN ('Completed', 'Stuffed') OR ss.execution_status IN ('Executed', 'Stuffed', 'Loading Completed', 'Completed', 'Dispatched'))
        )`),
      ],
    };
  }

  private async buildQueryOptions(
    query: any,
    options?: { tabOverride?: string; ignoreTab?: boolean },
  ) {
    const {
      search,
      status,
      tab,
      timeline,
      buyerId,
      sellerId,
      productId,
      country,
      portOfLoading,
      portOfDischarge,
      currency,
      financialYear,
      shipmentMonth,
      shipmentYear,
      shipmentDateFrom,
      shipmentDateTo,
      companyId,
      businessReference,
    } = query;

    const whereClause: any = {};
    const contractWhereClause: any = {};

    if (businessReference) {
      whereClause.businessTransactionId =
        (await resolveBusinessTransactionId(businessReference, companyId)) ??
        -1;
    }

    if (companyId) {
      contractWhereClause.companyId = companyId;
    }

    // 1. Shipment Date range
    if (shipmentDateFrom || shipmentDateTo) {
      whereClause.shipmentDate = {};
      if (shipmentDateFrom) whereClause.shipmentDate[Op.gte] = shipmentDateFrom;
      if (shipmentDateTo) whereClause.shipmentDate[Op.lte] = shipmentDateTo;
    }

    // 2. Month and Year extraction
    if (shipmentMonth) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn(
            'EXTRACT',
            Sequelize.literal(
              'MONTH FROM "SalesContractShipment"."shipment_date"',
            ),
          ),
          Number(shipmentMonth),
        ),
      );
    }
    if (shipmentYear) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn(
            'EXTRACT',
            Sequelize.literal(
              'YEAR FROM "SalesContractShipment"."shipment_date"',
            ),
          ),
          Number(shipmentYear),
        ),
      );
    }

    const userPermissions = query.userPermissions;
    const isDocOnly =
      query.userType !== 'super_admin' &&
      query.userType !== 'client_admin' &&
      userPermissions &&
      userPermissions.has('shipment_stuffing_execution:read') &&
      !userPermissions.has('shipment:read');

    // Tab Filtering (Pending vs Stuffed / Executed)
    let rawTab =
      options?.tabOverride !== undefined
        ? options.tabOverride
        : tab ||
          (['pending', 'executed', 'stuffed'].includes(
            String(status || '').toLowerCase(),
          )
            ? String(status).toLowerCase() === 'stuffed'
              ? 'executed'
              : String(status).toLowerCase()
            : undefined);

    if (isDocOnly) {
      rawTab = 'executed';
    }

    const normalizedTab = options?.ignoreTab
      ? 'all'
      : rawTab
        ? String(rawTab).toLowerCase()
        : 'pending';

    if (normalizedTab === 'executed') {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(this.getExecutedCondition());
    } else if (normalizedTab === 'pending') {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(this.getPendingCondition());
    }

    // 3. Workflow Status (only if status is not tab name 'pending'/'executed'/'stuffed')
    if (
      status &&
      !['pending', 'executed', 'stuffed'].includes(String(status).toLowerCase())
    ) {
      whereClause.status = status;
    }

    // 4. Timeline (dynamic runtime chip states mapped to query constraints)
    if (timeline) {
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrowObj = new Date();
      tomorrowObj.setDate(tomorrowObj.getDate() + 1);
      const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

      if (timeline === 'Today') {
        whereClause.shipmentDate = todayStr;
        whereClause.status = { [Op.ne]: 'Delivered' };
      } else if (timeline === 'Tomorrow') {
        whereClause.shipmentDate = tomorrowStr;
        whereClause.status = { [Op.ne]: 'Delivered' };
      } else if (timeline === 'Upcoming') {
        whereClause.shipmentDate = { [Op.gt]: todayStr };
        whereClause.status = { [Op.ne]: 'Delivered' };
      } else if (timeline === 'Overdue') {
        whereClause.shipmentDate = { [Op.lt]: todayStr };
        whereClause.status = { [Op.notIn]: ['Delivered', 'Cancelled'] };
      } else if (timeline === 'Completed') {
        whereClause.status = 'Delivered';
      }
    }

    // 5. Parent Contract Filters
    if (buyerId) contractWhereClause.buyerId = buyerId;
    if (sellerId) contractWhereClause.sellerId = sellerId;
    if (currency) contractWhereClause.currencyCode = currency;
    if (financialYear) contractWhereClause.financialYear = financialYear;
    if (portOfLoading)
      contractWhereClause.portOfLoading = { [Op.iLike]: `%${portOfLoading}%` };
    if (portOfDischarge)
      contractWhereClause.portOfDischarge = {
        [Op.iLike]: `%${portOfDischarge}%`,
      };

    if (country) {
      contractWhereClause[Op.or] = [
        { originCountry: { [Op.iLike]: `%${country}%` } },
        { destinationCountry: { [Op.iLike]: `%${country}%` } },
      ];
    }

    // 5b. Product filter (via subquery on sales_contract_items to prevent cartesian duplication)
    if (productId) {
      contractWhereClause.id = {
        [Op.in]: Sequelize.literal(
          `(SELECT sales_contract_id FROM sales_contract_items WHERE product_id = ${Number(productId)})`,
        ),
      };
    }

    // 6. Search across multiple tables
    if (search) {
      const searchConditions: any[] = [
        { shipmentReference: { [Op.iLike]: `%${search}%` } },
        { '$salesContract.contract_number$': { [Op.iLike]: `%${search}%` } },
        { '$salesContract.buyer.entity_name$': { [Op.iLike]: `%${search}%` } },
      ];
      if (isBusinessReferenceSearch(search)) {
        const transactionId = await resolveBusinessTransactionId(
          search,
          companyId,
        );
        if (transactionId !== null) {
          searchConditions.push({ businessTransactionId: transactionId });
        }
      }
      whereClause[Op.or] = searchConditions;
    }

    // Strictly 1:1 Includes: 1 shipment = 1 SQL row (eliminates pagination bugs)
    const includes: any[] = [
      {
        model: SalesContract,
        as: 'salesContract',
        where:
          Object.keys(contractWhereClause).length > 0
            ? contractWhereClause
            : undefined,
        required: true,
        include: [
          { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
          { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
          { model: ShipmentType, as: 'shipmentType' },
        ],
      },
      {
        model: BusinessTransaction,
        as: 'businessTransaction',
        attributes: ['id', 'businessReference'],
        required: false,
      },
      {
        model: User,
        as: 'manualReadyByUser',
        attributes: ['id', 'name', 'email'],
        required: false,
      },
      {
        // Include stuffing record so we can check if stuffing is actually completed
        model: ShipmentStuffing,
        as: 'stuffingExecution',
        attributes: ['id', 'stuffingStatus', 'executionStatus', 'completedAt'],
        required: false,
      },
    ];

    return { whereClause, includes };
  }

  async findAll(query: any) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'shipmentDate',
      sortOrder = 'ASC',
      status,
      tab,
    } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const rawTab =
      tab ||
      (['pending', 'executed', 'stuffed'].includes(
        String(status || '').toLowerCase(),
      )
        ? String(status).toLowerCase() === 'stuffed'
          ? 'executed'
          : String(status).toLowerCase()
        : 'pending');

    const requestedTab = String(rawTab).toLowerCase();

    const { whereClause, includes } = await this.buildQueryOptions(query, {
      tabOverride: requestedTab,
    });

    const oppositeTab = requestedTab === 'executed' ? 'pending' : 'executed';
    const { whereClause: oppositeWhereClause } = await this.buildQueryOptions(
      query,
      { tabOverride: oppositeTab },
    );

    // Determine sorting
    let order: any[] = [['shipmentDate', 'ASC']];
    if (sortBy === 'shipmentReference') {
      order = [['shipmentReference', sortOrder]];
    } else if (sortBy === 'shipmentDate') {
      order = [['shipmentDate', sortOrder]];
    } else if (sortBy === 'quantity') {
      order = [['quantity', sortOrder]];
    } else if (sortBy === 'status') {
      order = [['status', sortOrder]];
    } else if (sortBy === 'businessReference') {
      order = [
        [
          { model: BusinessTransaction, as: 'businessTransaction' },
          'businessReference',
          String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
        ],
      ];
    }

    const [listResult, oppositeCount] = await Promise.all([
      this.shipmentModel.findAndCountAll({
        where: whereClause,
        include: includes,
        distinct: true,
        subQuery: false,
        limit: Number(limit),
        offset: Number(offset),
        order,
      }),
      this.shipmentModel.count({
        where: oppositeWhereClause,
        include: includes,
        distinct: true,
      }),
    ]);

    const rows = listResult.rows;
    const count = listResult.count;

    const pendingCount = requestedTab === 'executed' ? oppositeCount : count;
    const executedCount = requestedTab === 'executed' ? count : oppositeCount;

    const contractIds = Array.from(
      new Set(
        rows
          .map((s) => s.salesContractId || s.salesContract?.id)
          .filter(Boolean),
      ),
    );

    const itemsByContract = new Map<number, any[]>();
    const docsByContract = new Map<number, any[]>();
    const filesByContract = new Map<number, any[]>();

    if (contractIds.length > 0) {
      const [items, documents, documentFiles] = await Promise.all([
        this.itemModel.findAll({
          where: { salesContractId: { [Op.in]: contractIds } },
          include: [
            { model: Product, as: 'product', attributes: ['id', 'name'] },
          ],
        }),
        this.docModel.findAll({
          where: { salesContractId: { [Op.in]: contractIds } },
          include: [
            {
              model: TradeDocument,
              as: 'tradeDocument',
              attributes: ['id', 'name', 'mandatoryByDefault'],
            },
          ],
        }),
        this.docFileModel.findAll({
          where: { salesContractId: { [Op.in]: contractIds } },
          attributes: [
            'id',
            'salesContractId',
            'tradeDocumentId',
            'attachmentId',
          ],
        }),
      ]);

      for (const item of items) {
        const cid = (item as any).salesContractId;
        if (!itemsByContract.has(cid)) itemsByContract.set(cid, []);
        itemsByContract.get(cid).push(item);
      }

      for (const doc of documents) {
        const cid = (doc as any).salesContractId;
        if (!docsByContract.has(cid)) docsByContract.set(cid, []);
        docsByContract.get(cid).push(doc);
      }

      for (const file of documentFiles) {
        const cid = (file as any).salesContractId;
        if (!filesByContract.has(cid)) filesByContract.set(cid, []);
        filesByContract.get(cid).push(file);
      }
    }

    // Batch evaluate shipment readiness (Cargo Allocation + Freight Allocation)
    const readinessMap = await this.readinessService.evaluateBatch(rows);

    const shipmentIds = rows.map((s) => s.id).filter(Boolean);
    const pcByShipment = new Map<number, Set<string>>();
    const pcBySc = new Map<number, Set<string>>();
    const pcByBusinessTransaction = new Map<number, Set<string>>();
    const pcDataByShipment = new Map<number, any>();
    const pcDataBySc = new Map<number, any>();
    const pcDataByBusinessTransaction = new Map<number, any>();
    const businessTransactionIds = Array.from(
      new Set(
        rows
          .flatMap((shipment) => [
            shipment.businessTransactionId,
            shipment.businessTransaction?.id,
            shipment.salesContract?.businessTransactionId,
            shipment.salesContract?.businessTransaction?.id,
          ])
          .filter((id) => id !== null && id !== undefined)
          .map(Number),
      ),
    );

    if (shipmentIds.length > 0) {
      try {
        const [directPcRows]: any = await this.sequelize.query(
          `SELECT 
             pcs.shipment_id,
             pc.id AS pc_id,
             pc.contract_number,
             pc.quantity AS pc_quantity,
             pc.place_of_loading,
             pc.delivery_place,
             pc.seller_id,
             st.id AS pc_shipment_type_id,
             st.code AS pc_shipment_type_code,
             st.purchase_contract_delivery_place_required,
             seller.entity_name AS seller_name,
             COALESCE(pci.product_name, prod.name) AS product_name
           FROM purchase_contract_shipments pcs
           JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
           LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
           LEFT JOIN partners seller ON pc.seller_id = seller.id
           LEFT JOIN LATERAL (
             SELECT product_id, product_name 
             FROM purchase_contract_items 
             WHERE purchase_contract_id = pc.id 
             ORDER BY id ASC LIMIT 1
           ) pci ON true
           LEFT JOIN products prod ON pci.product_id = prod.id
           WHERE pcs.shipment_id IN (:shipmentIds)`,
          {
            replacements: { shipmentIds },
          },
        );

        const rowsList = Array.isArray(directPcRows) ? directPcRows : [];
        for (const row of rowsList) {
          const sId = Number(row.shipment_id || row.shipmentId);
          const cNum = row.contract_number || row.contractNumber;
          if (sId && cNum) {
            if (!pcByShipment.has(sId)) pcByShipment.set(sId, new Set());
            pcByShipment.get(sId).add(cNum);
          }
          if (sId && !pcDataByShipment.has(sId)) {
            pcDataByShipment.set(sId, row);
          }
        }
      } catch (err) {
        console.warn('Could not batch fetch purchase_contract_shipments:', err);
      }
    }

    if (contractIds.length > 0 || businessTransactionIds.length > 0) {
      try {
        const [scPcRows]: any = await this.sequelize.query(
          `SELECT 
             pc.sales_contract_id,
             pc.id AS pc_id,
             pc.contract_number,
             pc.quantity AS pc_quantity,
             pc.business_transaction_id,
             pc.place_of_loading,
             pc.delivery_place,
             pc.seller_id,
             st.id AS pc_shipment_type_id,
             st.code AS pc_shipment_type_code,
             st.purchase_contract_delivery_place_required,
             seller.entity_name AS seller_name,
             COALESCE(pci.product_name, prod.name) AS product_name
           FROM purchase_contracts pc
           LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
           LEFT JOIN partners seller ON pc.seller_id = seller.id
           LEFT JOIN LATERAL (
             SELECT product_id, product_name 
             FROM purchase_contract_items 
             WHERE purchase_contract_id = pc.id 
             ORDER BY id ASC LIMIT 1
           ) pci ON true
           LEFT JOIN products prod ON pci.product_id = prod.id
           WHERE pc.sales_contract_id IN (:contractIds)
              OR pc.business_transaction_id IN (:businessTransactionIds)
           ORDER BY pc.updated_at DESC, pc.id DESC`,
          {
            replacements: { contractIds, businessTransactionIds },
          },
        );

        const rowsList = Array.isArray(scPcRows) ? scPcRows : [];
        for (const row of rowsList) {
          const scId = Number(row.sales_contract_id || row.salesContractId);
          const cNum = row.contract_number || row.contractNumber;
          if (scId && cNum) {
            if (!pcBySc.has(scId)) pcBySc.set(scId, new Set());
            pcBySc.get(scId).add(cNum);
          }
          if (scId && !pcDataBySc.has(scId)) {
            pcDataBySc.set(scId, row);
          }
          const businessTransactionId = Number(row.business_transaction_id);
          if (businessTransactionId && cNum) {
            if (!pcByBusinessTransaction.has(businessTransactionId)) {
              pcByBusinessTransaction.set(businessTransactionId, new Set());
            }
            pcByBusinessTransaction.get(businessTransactionId).add(cNum);
          }
          if (
            businessTransactionId &&
            !pcDataByBusinessTransaction.has(businessTransactionId)
          ) {
            pcDataByBusinessTransaction.set(businessTransactionId, row);
          }
        }
      } catch (err) {
        console.warn(
          'Could not batch fetch purchase_contracts for sales contracts:',
          err,
        );
      }
    }

    const data = rows.map((shipment) => {
      const json: any = shipment.toJSON ? shipment.toJSON() : { ...shipment };

      // stuffingCompleted = true ONLY when stuffing record exists AND stuffingStatus === 'Completed'
      // This is the source of truth for showing 'Stuffed / Executed' button on the frontend
      const stuffing = json.stuffingExecution;
      const stuffingCompleted = stuffing?.stuffingStatus === 'Completed';
      json.stuffingCompleted = stuffingCompleted;

      // isExecuted = shipment has gone through execution (status is a terminal execution state)
      const isExecuted = ['Executed', 'Dispatched', 'Completed'].includes(
        json.status,
      );
      json.isExecuted = isExecuted;

      json.businessReference =
        json.businessTransaction?.businessReference ?? null;
      const contractId = json.salesContractId || json.salesContract?.id;
      const contractItems = itemsByContract.get(contractId) || [];
      const contractDocs = docsByContract.get(contractId) || [];
      const contractFiles = filesByContract.get(contractId) || [];

      if (json.salesContract) {
        json.salesContract.items = contractItems;
        json.salesContract.documents = contractDocs;
        json.salesContract.documentFiles = contractFiles;
      }

      // Dynamic timeline object injection
      json.timeline = this.calculateTimeline(json.shipmentDate, json.status);

      // Extract products list for grid ease
      json.products = contractItems.map((item: any) => ({
        id: item.product?.id,
        name: item.product?.name,
      }));

      // Calculate document progress
      const mandatoryDocs = contractDocs.filter((doc: any) => doc.isMandatory);
      const uploadedMandatoryCount = mandatoryDocs.filter((doc: any) =>
        contractFiles.some(
          (file: any) => file.tradeDocumentId === doc.tradeDocumentId,
        ),
      ).length;

      json.documentProgress = {
        total: mandatoryDocs.length,
        uploaded: uploadedMandatoryCount,
        percentage:
          mandatoryDocs.length > 0
            ? Math.round((uploadedMandatoryCount / mandatoryDocs.length) * 100)
            : 100,
        checklist: contractDocs.map((doc: any) => {
          const hasFile = contractFiles.some(
            (file: any) => file.tradeDocumentId === doc.tradeDocumentId,
          );
          return {
            name: doc.tradeDocument?.name || 'Document',
            isMandatory: doc.isMandatory,
            uploaded: hasFile,
          };
        }),
      };

      // ── Shipment Readiness Gates (Cargo Allocation & Freight Allocation + Manual Override) ──
      const readiness = readinessMap.get(json.id) || {
        cargoReady: false,
        freightReady: false,
        freightRequired: false,
        freightRuleReason: null,
        isFreightNotApplicable: true,
        freightAllocationStatus: 'No' as const,
        systemReady: false,
        manualReadyOverride: null,
        manualReadyBy: null,
        manualReadyByUser: null,
        manualReadyAt: null,
        manualReadyReason: null,
        readyForShipment: false,
        isManualOverride: false,
        readySource: 'System' as const,
        reasons: [],
      };

      json.cargoReady = readiness.cargoReady;
      json.freightReady = readiness.freightReady;
      json.freightRequired = readiness.freightRequired;
      json.isFreightRequired = readiness.freightRequired;
      json.freightRuleReason = readiness.freightRuleReason;
      json.isFreightNotApplicable = readiness.isFreightNotApplicable;
      json.freightAllocationStatus = readiness.freightAllocationStatus;

      if (!readiness.freightRequired) {
        json.freight = null;
        json.freightCurrency = null;
        json.freightDescription = null;
      }

      json.systemReady = readiness.systemReady;

      json.manualReadyOverride = readiness.manualReadyOverride;
      json.manualReadyBy = readiness.manualReadyBy;
      json.manualReadyByUser = readiness.manualReadyByUser;
      json.manualReadyAt = readiness.manualReadyAt;
      json.manualReadyReason = readiness.manualReadyReason;
      json.readyForShipment =
        readiness.manualReadyOverride !== null
          ? Boolean(readiness.manualReadyOverride)
          : json.systemReady;
      json.isManualOverride = readiness.isManualOverride;
      json.readySource = readiness.readySource;
      json.readinessReasons = readiness.reasons;

      // Format Sales Contract No, Purchase Contract No, and Shipment Ref No
      const rawSc = json.salesContract?.contractNumber;
      const salesContractNo = rawSc
        ? String(rawSc).trim().toUpperCase().startsWith('SC-')
          ? String(rawSc).trim()
          : `SC-${String(rawSc).trim()}`
        : '-';

      let purchaseContractNo = '-';
      const linkedPcs = pcByShipment.get(json.id);
      const businessTransactionId =
        json.businessTransactionId ||
        json.businessTransaction?.id ||
        json.salesContract?.businessTransactionId ||
        json.salesContract?.businessTransaction?.id;
      const transactionPcs = businessTransactionId
        ? pcByBusinessTransaction.get(Number(businessTransactionId))
        : undefined;
      if (linkedPcs && linkedPcs.size > 0) {
        purchaseContractNo = Array.from(linkedPcs)
          .map((num) => {
            const s = String(num).trim();
            return s.toUpperCase().startsWith('PC-') ? s : `PC-${s}`;
          })
          .join(', ');
      } else if (
        contractId &&
        pcBySc.has(contractId) &&
        pcBySc.get(contractId).size > 0
      ) {
        purchaseContractNo = Array.from(pcBySc.get(contractId))
          .map((num) => {
            const s = String(num).trim();
            return s.toUpperCase().startsWith('PC-') ? s : `PC-${s}`;
          })
          .join(', ');
      } else if (transactionPcs && transactionPcs.size > 0) {
        purchaseContractNo = Array.from(transactionPcs)
          .map((num) => {
            const s = String(num).trim();
            return s.toUpperCase().startsWith('PC-') ? s : `PC-${s}`;
          })
          .join(', ');
      }

      const shipmentRefNo =
        json.shipmentReference ||
        (json.shipmentNo
          ? `SH-${String(json.shipmentNo).padStart(6, '0')}`
          : '-');

      json.shipmentRefNo = shipmentRefNo;
      json.salesContractNo = salesContractNo;
      json.purchaseContractNo = purchaseContractNo;

      // Auto Route Source Mapping (Purchase Contract → Sales Contract)
      const pcData =
        pcDataByShipment.get(json.id) ||
        (contractId ? pcDataBySc.get(contractId) : null) ||
        (businessTransactionId
          ? pcDataByBusinessTransaction.get(Number(businessTransactionId))
          : null);
      const sc = json.salesContract || {};

      // Origin: ALWAYS Purchase Contract → Place of Loading
      const origin =
        pcData?.place_of_loading ||
        json.origin ||
        sc.originLocationName ||
        sc.portOfLoading ||
        '—';

      // Destination: ALWAYS Linked Sales Contract → Delivery Place
      const destination =
        getContractDestination(sc) ||
        sc.deliveryPlace ||
        pcData?.delivery_place ||
        json.destination ||
        '—';

      // Commodity: Purchase Contract
      const commodity =
        pcData?.product_name || contractItems[0]?.product?.name || '—';

      // Buyer: Sales Contract
      const buyer = sc.buyer?.entityName || '—';

      // Supplier: Purchase Contract
      const supplier = pcData?.seller_name || '—';

      json.origin = origin;
      json.destination = destination;
      json.commodity = commodity;
      json.buyer = buyer;
      json.supplier = supplier;
      json.route = `${origin} ➔ ${destination}`;

      if (pcData) {
        json.purchaseContract = {
          id: pcData.pc_id,
          contractNumber: pcData.contract_number,
          placeOfLoading: pcData.place_of_loading,
          deliveryPlace: pcData.delivery_place,
          sellerId: pcData.seller_id,
          sellerName: pcData.seller_name,
          productName: pcData.product_name,
          quantity: pcData.pc_quantity,
        };
      }
      json.purchaseContractQuantity = pcData?.pc_quantity ?? null;

      return json;
    });

    return {
      data,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(count / Number(limit))),
      pendingCount,
      executedCount,
    };
  }

  async getStats(query: any) {
    const { whereClause, includes } = await this.buildQueryOptions(query, {
      ignoreTab: query.tab !== undefined ? false : true,
    });
    const todayStr = new Date().toISOString().split('T')[0];
    const next7DaysObj = new Date();
    next7DaysObj.setDate(next7DaysObj.getDate() + 7);
    const next7DaysStr = next7DaysObj.toISOString().split('T')[0];

    // Fetch matching shipments to aggregate stats
    const shipments = await this.shipmentModel.findAll({
      where: whereClause,
      include: includes,
    });

    const total = shipments.length;
    let pendingCount = 0;
    let executedCount = 0;
    let todayCount = 0;
    let upcoming7Days = 0;
    let delayedCount = 0;
    let inTransitCount = 0;
    let pendingDocsCount = 0;
    let totalContainers = 0;
    let totalQuantity = 0;

    const contractIds = Array.from(
      new Set(
        shipments
          .map((s) => s.salesContractId || s.salesContract?.id)
          .filter(Boolean),
      ),
    );

    const docsByContract = new Map<number, any[]>();
    const filesByContract = new Map<number, any[]>();

    if (contractIds.length > 0) {
      const [documents, documentFiles] = await Promise.all([
        this.docModel.findAll({
          where: { salesContractId: { [Op.in]: contractIds } },
        }),
        this.docFileModel.findAll({
          where: { salesContractId: { [Op.in]: contractIds } },
          attributes: ['id', 'salesContractId', 'tradeDocumentId'],
        }),
      ]);

      for (const doc of documents) {
        const cid = (doc as any).salesContractId;
        if (!docsByContract.has(cid)) docsByContract.set(cid, []);
        docsByContract.get(cid).push(doc);
      }

      for (const file of documentFiles) {
        const cid = (file as any).salesContractId;
        if (!filesByContract.has(cid)) filesByContract.set(cid, []);
        filesByContract.get(cid).push(file);
      }
    }

    for (const s of shipments) {
      const dateStr = s.shipmentDate.toString();
      const status = s.status;

      // Executed vs Pending tally
      const isExecuted =
        ['Executed', 'Dispatched', 'Completed'].includes(status) ||
        ['Executed', 'Loading Completed', 'Dispatched', 'Completed'].includes(
          s.executionStatus || '',
        ) ||
        s.stuffingExecution?.stuffingStatus === 'Completed' ||
        ['Executed', 'Loading Completed', 'Dispatched', 'Completed'].includes(
          s.stuffingExecution?.executionStatus || '',
        );
      if (isExecuted) {
        executedCount++;
      } else {
        pendingCount++;
      }

      // Aggregates
      totalContainers += s.noOfContainers ? Number(s.noOfContainers) : 0;
      totalQuantity += s.quantity ? Number(s.quantity) : 0;

      // Status
      if (status === 'In Transit') inTransitCount++;

      // Today
      if (dateStr === todayStr && status !== 'Delivered') todayCount++;

      // Upcoming (7 Days)
      if (
        dateStr > todayStr &&
        dateStr <= next7DaysStr &&
        status !== 'Delivered'
      ) {
        upcoming7Days++;
      }

      // Delayed
      if (
        dateStr < todayStr &&
        status !== 'Delivered' &&
        status !== 'Cancelled'
      ) {
        delayedCount++;
      }

      // Check document completeness
      const cid = s.salesContractId || s.salesContract?.id;
      if (cid) {
        const mandatoryDocs = (docsByContract.get(cid) || []).filter(
          (doc: any) => doc.isMandatory,
        );
        const uploadedFiles = filesByContract.get(cid) || [];
        const missingMandatory = mandatoryDocs.some(
          (doc: any) =>
            !uploadedFiles.some(
              (file: any) => file.tradeDocumentId === doc.tradeDocumentId,
            ),
        );
        if (missingMandatory) {
          pendingDocsCount++;
        }
      }
    }

    return {
      total,
      pendingCount,
      executedCount,
      today: todayCount,
      upcoming: upcoming7Days,
      delayed: delayedCount,
      inTransit: inTransitCount,
      pendingDocuments: pendingDocsCount,
      totalContainers,
      totalQuantity: parseFloat(totalQuantity.toFixed(2)),
    };
  }

  async exportExcel(query: any): Promise<Buffer> {
    const { whereClause, includes } = await this.buildQueryOptions(query);
    const shipments = await this.shipmentModel.findAll({
      where: whereClause,
      include: includes,
      order: [['shipmentDate', 'ASC']],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shipments');
    worksheet.columns = [
      { header: 'Business Ref No.', key: 'businessReference', width: 22 },
      { header: 'Shipment Ref', key: 'shipmentReference', width: 24 },
      { header: 'Sales Contract No.', key: 'contractNumber', width: 24 },
      { header: 'Buyer', key: 'buyer', width: 28 },
      { header: 'Seller', key: 'seller', width: 28 },
      { header: 'Shipment Date', key: 'shipmentDate', width: 16 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Quantity (MT)', key: 'quantity', width: 16 },
    ];

    for (const shipment of shipments) {
      const row: any = shipment.toJSON();
      worksheet.addRow({
        businessReference: row.businessTransaction?.businessReference ?? null,
        shipmentReference: row.shipmentReference,
        contractNumber: row.salesContract?.contractNumber ?? null,
        buyer: row.salesContract?.buyer?.entityName ?? null,
        seller: row.salesContract?.seller?.entityName ?? null,
        shipmentDate: row.shipmentDate,
        status: row.status,
        quantity: Number(row.quantity ?? 0),
      });
    }

    worksheet.getRow(1).font = { bold: true };
    const contents = await workbook.xlsx.writeBuffer();
    return Buffer.from(contents);
  }

  async update(id: number, dto: UpdateShipmentDto, user?: any) {
    const shipment = await this.shipmentModel.findByPk(id, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [{ model: ShipmentType, as: 'shipmentType' }],
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    if (
      user?.companyId &&
      shipment.salesContract?.companyId !== user.companyId
    ) {
      throw new NotFoundException('Shipment not found');
    }
    // Prevent duplicate execution
    if (dto.status === 'Executed') {
      if (
        ['Executed', 'Stuffed', 'Dispatched', 'Completed'].includes(
          shipment.status,
        )
      ) {
        throw new BadRequestException('Shipment is already executed.');
      }
    }

    // Capture changes to check if we need reference regeneration
    const hasCoreRefChanged =
      (dto.shipmentNo !== undefined &&
        dto.shipmentNo !== shipment.shipmentNo) ||
      (dto.noOfContainers !== undefined &&
        dto.noOfContainers !== shipment.noOfContainers) ||
      (dto.shipmentDate !== undefined &&
        dto.shipmentDate !== shipment.shipmentDate.toString()) ||
      (dto.quantity !== undefined && dto.quantity !== shipment.quantity);

    // Apply updates
    if (dto.shipmentDate !== undefined)
      shipment.shipmentDate = new Date(dto.shipmentDate);
    if (dto.quantity !== undefined) shipment.quantity = dto.quantity;
    if (dto.noOfContainers !== undefined)
      shipment.noOfContainers = dto.noOfContainers;
    if (dto.ratePerMt !== undefined) shipment.ratePerMt = dto.ratePerMt;
    if (dto.purchaseRate !== undefined)
      shipment.purchaseRate = dto.purchaseRate;
    if (dto.forex !== undefined) shipment.forex = dto.forex;

    // Evaluate Dynamic Freight Rule Engine
    let pcShipmentType: any = null;
    try {
      const [pcRow]: any = await this.sequelize.query(
        `SELECT 
           st.id,
            st.code
         FROM purchase_contracts pc
         JOIN shipment_types st ON st.id = pc.shipment_type_id
         LEFT JOIN purchase_contract_shipments pcs ON pcs.purchase_contract_id = pc.id
         WHERE pcs.shipment_id = :id
            OR (pc.sales_contract_id IS NOT NULL AND pc.sales_contract_id = :scId)
            OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :btId)
         ORDER BY CASE WHEN pcs.shipment_id = :id THEN 1 ELSE 2 END, pc.updated_at DESC
         LIMIT 1`,
        {
          replacements: {
            id,
            scId: shipment.salesContractId || -1,
            btId: shipment.businessTransactionId || -1,
          },
        },
      );
      if (pcRow && pcRow[0]) pcShipmentType = pcRow[0];
    } catch (e) {}

    const scShipmentType = shipment.salesContract?.shipmentType || null;
    const freightRule = evaluateFreightRequired(
      pcShipmentType,
      scShipmentType,
      id,
    );
    const isFreightRequired = freightRule.freightRequired;
    shipment.freightRequired = isFreightRequired;

    if (!isFreightRequired) {
      // If Freight Required = NO:
      // Completely hide Freight Allocation, Freight Amount, Freight Currency, Freight Description.
      // Do not validate these fields.
      // Do not save these values in the database.
      shipment.freight = null as any;
      shipment.freightAllocationStatus = 'No';
      shipment.freightCurrency = null;
      shipment.freightDescription = null;
    } else {
      if (dto.freight !== undefined) shipment.freight = dto.freight;
      if (dto.freightCurrency !== undefined)
        shipment.freightCurrency = dto.freightCurrency;
      if (dto.freightDescription !== undefined)
        shipment.freightDescription = dto.freightDescription;
    }
    if (dto.remarks !== undefined) shipment.remarks = dto.remarks;
    if (dto.shipmentNo !== undefined) shipment.shipmentNo = dto.shipmentNo;

    // Regenerate reference if core values changed and contract number is available
    if (hasCoreRefChanged && shipment.salesContract) {
      const contractNo = shipment.salesContract.contractNumber;
      shipment.shipmentReference = generateShipmentReference(
        contractNo,
        shipment.shipmentNo,
        shipment.noOfContainers,
        shipment.shipmentDate,
        shipment.quantity,
      );
    }

    const targetStatus =
      dto.status !== undefined ? dto.status : shipment.status;
    const isExecutionTransition =
      targetStatus === 'Executed' && shipment.status !== 'Executed';

    if (targetStatus === 'Executed') {
      if (isExecutionTransition) {
        // 1. Validate Readiness
        const readiness = await this.readinessService.evaluate(shipment);
        if (!readiness.readyForShipment) {
          throw new BadRequestException(
            'Shipment cannot be executed until cargo and freight allocation are ready.',
          );
        }

        // 2. Validate Available Stock
        await this.stockService.validateShipmentStock(
          shipment,
          user?.companyId || shipment.salesContract?.companyId,
        );
      }

      shipment.status = 'Executed';
      shipment.executionStatus = shipment.executionStatus || 'Pending';
      await this.sequelize.transaction(async (transaction) => {
        await shipment.save({ transaction });
        await this.ensureExecutionRecords(
          shipment,
          transaction,
          user?.userId ?? user?.id ?? null,
        );
      });
    } else {
      if (dto.status !== undefined) shipment.status = dto.status;
      await shipment.save();
    }

    // ── AUTO-CREATE PURCHASE CONTRACT (idempotent) ────────────────────────────
    // Ensures a Purchase Contract exists for this Sales Contract after any shipment save.
    // Safe to call multiple times — returns existing PC if already created.
    await this.purchaseContractService
      .ensureExists(
        shipment.salesContractId,
        user?.userId,
        [shipment.id],
        false,
        Number(shipment.quantity) || 0,
      )
      .catch((err) => {
        // Non-blocking: PC creation failure must not break shipment update
        console.error(
          '[ShipmentService] ensureExists failed (non-fatal):',
          err?.message,
        );
      });

    // Reload with associations
    const reloaded = await this.shipmentModel.findByPk(id, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
            { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
            { model: ShipmentType, as: 'shipmentType' },
            {
              model: SalesContractItem,
              as: 'items',
              include: [
                { model: Product, as: 'product', attributes: ['id', 'name'] },
              ],
            },
          ],
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: User,
          as: 'manualReadyByUser',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!reloaded) return null;
    const readiness = await this.readinessService.evaluate(reloaded);
    const json: any = reloaded.toJSON ? reloaded.toJSON() : { ...reloaded };
    json.businessReference =
      json.businessTransaction?.businessReference ?? null;
    json.cargoReady = readiness.cargoReady;
    json.freightReady = readiness.freightReady;
    json.isFreightNotApplicable = readiness.isFreightNotApplicable;
    json.freightAllocationStatus = readiness.freightAllocationStatus;
    json.systemReady = readiness.systemReady;
    json.manualReadyOverride = readiness.manualReadyOverride;
    json.manualReadyBy = readiness.manualReadyBy;
    json.manualReadyByUser = readiness.manualReadyByUser;
    json.manualReadyAt = readiness.manualReadyAt;
    json.manualReadyReason = readiness.manualReadyReason;
    json.readyForShipment = readiness.readyForShipment;
    json.isManualOverride = readiness.isManualOverride;
    json.readySource = readiness.readySource;
    json.readinessReasons = readiness.reasons;

    const rawSc = json.salesContract?.contractNumber;
    json.salesContractNo = rawSc
      ? String(rawSc).trim().toUpperCase().startsWith('SC-')
        ? String(rawSc).trim()
        : `SC-${String(rawSc).trim()}`
      : '-';

    let purchaseContractNo = '-';
    try {
      const [directPcRows]: any = await this.sequelize.query(
        `SELECT pc.contract_number
         FROM purchase_contract_shipments pcs
         JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
         WHERE pcs.shipment_id = :shipmentId`,
        { replacements: { shipmentId: json.id } },
      );
      const rowsList = Array.isArray(directPcRows) ? directPcRows : [];
      if (rowsList.length > 0) {
        purchaseContractNo = rowsList
          .map((r: any) => {
            const num = String(
              r.contract_number || r.contractNumber || '',
            ).trim();
            return num.toUpperCase().startsWith('PC-') ? num : `PC-${num}`;
          })
          .filter(Boolean)
          .join(', ');
      } else if (json.salesContractId) {
        const [scPcRows]: any = await this.sequelize.query(
          `SELECT pc.contract_number
           FROM purchase_contracts pc
           LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
           WHERE pc.sales_contract_id = :salesContractId`,
          { replacements: { salesContractId: json.salesContractId } },
        );
        const scList = Array.isArray(scPcRows) ? scPcRows : [];
        if (scList.length > 0) {
          purchaseContractNo = scList
            .map((r: any) => {
              const num = String(
                r.contract_number || r.contractNumber || '',
              ).trim();
              return num.toUpperCase().startsWith('PC-') ? num : `PC-${num}`;
            })
            .filter(Boolean)
            .join(', ');
        }
      }
    } catch (err) {
      console.warn(
        'Could not fetch linked purchase contract for findOne:',
        err,
      );
    }

    json.purchaseContractNo = purchaseContractNo || '-';
    json.shipmentRefNo =
      json.shipmentReference ||
      (json.shipmentNo
        ? `SH-${String(json.shipmentNo).padStart(6, '0')}`
        : '-');

    return json;
  }

  async findOne(id: number, user?: any) {
    const shipment = await this.shipmentModel.findByPk(id, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
            { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
            { model: ShipmentType, as: 'shipmentType' },
          ],
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: User,
          as: 'manualReadyByUser',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }

    if (
      user?.companyId &&
      shipment.salesContract?.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }

    const readiness = await this.readinessService.evaluate(shipment);
    const json: any = shipment.toJSON ? shipment.toJSON() : { ...shipment };
    json.businessReference =
      json.businessTransaction?.businessReference ?? null;
    json.timeline = this.calculateTimeline(json.shipmentDate, json.status);
    json.cargoReady = readiness.cargoReady;
    json.freightReady = readiness.freightReady;
    json.isFreightNotApplicable = readiness.isFreightNotApplicable;
    json.freightAllocationStatus = readiness.freightAllocationStatus;
    json.systemReady = readiness.systemReady;
    json.manualReadyOverride = readiness.manualReadyOverride;
    json.manualReadyBy = readiness.manualReadyBy;
    json.manualReadyByUser = readiness.manualReadyByUser;
    json.manualReadyAt = readiness.manualReadyAt;
    json.manualReadyReason = readiness.manualReadyReason;
    json.readyForShipment = readiness.readyForShipment;
    json.isManualOverride = readiness.isManualOverride;
    json.readySource = readiness.readySource;
    json.readinessReasons = readiness.reasons;

    // Auto Route Source Mapping (Purchase Contract → Sales Contract)
    let pcData: any = null;
    try {
      const [pcRows]: any = await this.sequelize.query(
        `SELECT 
           pc.id AS pc_id,
           pc.contract_number,
           pc.place_of_loading,
           pc.delivery_place,
           pc.seller_id,
           st.id AS pc_shipment_type_id,
           st.code AS pc_shipment_type_code,
           st.purchase_contract_delivery_place_required,
           seller.entity_name AS seller_name,
           COALESCE(pci.product_name, prod.name) AS product_name
         FROM purchase_contracts pc
         LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
         LEFT JOIN purchase_contract_shipments pcs ON pcs.purchase_contract_id = pc.id
         LEFT JOIN partners seller ON pc.seller_id = seller.id
         LEFT JOIN LATERAL (
           SELECT product_id, product_name 
           FROM purchase_contract_items 
           WHERE purchase_contract_id = pc.id 
           ORDER BY id ASC LIMIT 1
         ) pci ON true
         LEFT JOIN products prod ON pci.product_id = prod.id
         WHERE pcs.shipment_id = :id
            OR (pc.sales_contract_id IS NOT NULL AND pc.sales_contract_id = :salesContractId)
            OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :btId)
         ORDER BY 
           CASE WHEN pcs.shipment_id = :id THEN 1 ELSE 2 END,
           pc.updated_at DESC
         LIMIT 1`,
        {
          replacements: {
            id,
            salesContractId: shipment.salesContractId || -1,
            btId: shipment.businessTransactionId || -1,
          },
        },
      );
      if (pcRows && pcRows.length > 0) {
        pcData = pcRows[0];
      }
    } catch (err) {
      console.warn(
        'Could not lookup purchase contract for shipment #',
        id,
        err,
      );
    }

    json.freightRequired = readiness.freightRequired;
    json.isFreightRequired = readiness.freightRequired;
    json.freightRuleReason = readiness.freightRuleReason;
    json.isFreightNotApplicable = readiness.isFreightNotApplicable;
    json.freightAllocationStatus = readiness.freightAllocationStatus;

    if (!readiness.freightRequired) {
      json.freight = null;
      json.freightCurrency = null;
      json.freightDescription = null;
    }

    const sc = json.salesContract || {};
    const origin =
      pcData?.place_of_loading ||
      json.origin ||
      sc.originLocationName ||
      sc.portOfLoading ||
      '—';
    const destination =
      getContractDestination(sc) ||
      sc.deliveryPlace ||
      pcData?.delivery_place ||
      json.destination ||
      '—';
    const commodity = pcData?.product_name || '—';
    const buyer = sc.buyer?.entityName || '—';
    const supplier = pcData?.seller_name || '—';

    json.origin = origin;
    json.destination = destination;
    json.commodity = commodity;
    json.buyer = buyer;
    json.supplier = supplier;
    json.route = `${origin} ➔ ${destination}`;
    if (pcData) {
      json.purchaseContract = {
        id: pcData.pc_id,
        contractNumber: pcData.contract_number,
        placeOfLoading: pcData.place_of_loading,
        deliveryPlace: pcData.delivery_place,
        sellerId: pcData.seller_id,
        sellerName: pcData.seller_name,
        productName: pcData.product_name,
      };
    }

    return json;
  }

  async updateManualReadiness(
    id: number,
    dto: UpdateManualReadinessDto,
    user?: any,
  ) {
    const shipment = await this.shipmentModel.findByPk(id, {
      include: [
        { model: SalesContract, as: 'salesContract' },
        {
          model: User,
          as: 'manualReadyByUser',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }

    if (
      user?.companyId &&
      shipment.salesContract?.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }

    // Reason is mandatory when selecting Yes or No
    if (
      dto.manualReadyOverride !== null &&
      (!dto.reason || !dto.reason.trim())
    ) {
      throw new BadRequestException(
        'Reason is required when selecting Yes or No for manual readiness override.',
      );
    }

    if (
      dto.manualReadyOverride === true &&
      shipment.cargoReadyConfirmed !== true
    ) {
      throw new BadRequestException(
        'Cargo Allocation must be marked Yes before marking this shipment as Ready.',
      );
    }

    const previousValue = {
      manualReadyOverride: shipment.manualReadyOverride,
      manualReadyBy: shipment.manualReadyBy,
      manualReadyAt: shipment.manualReadyAt,
      manualReadyReason: shipment.manualReadyReason,
    };

    const targetOverride =
      dto.manualReadyOverride === null || dto.manualReadyOverride === undefined
        ? null
        : Boolean(dto.manualReadyOverride);

    const now = new Date();
    const userId = user?.userId ?? user?.id ?? null;

    if (targetOverride === null) {
      // Revert to Default (System Status)
      shipment.manualReadyOverride = null;
      shipment.manualReadyBy = null;
      shipment.manualReadyAt = null;
      shipment.manualReadyReason = null;
    } else {
      shipment.manualReadyOverride = targetOverride;
      shipment.manualReadyBy = userId;
      shipment.manualReadyAt = now;
      shipment.manualReadyReason = dto.reason ? dto.reason.trim() : null;
    }

    await shipment.save();

    const newValue = {
      manualReadyOverride: shipment.manualReadyOverride,
      manualReadyBy: shipment.manualReadyBy,
      manualReadyAt: shipment.manualReadyAt,
      manualReadyReason: shipment.manualReadyReason,
    };

    // Audit Log for every manual readiness change
    await this.auditService.writeLog({
      clientId: user?.clientId ?? null,
      companyId: user?.companyId ?? null,
      userId: userId,
      entityType: 'SalesContractShipment',
      entityId: shipment.id,
      action: 'MANUAL_READINESS_OVERRIDE_CHANGED',
      oldValue: previousValue,
      newValue: {
        ...newValue,
        reason: shipment.manualReadyReason,
        changedBy: user?.name || user?.email || `User #${userId}`,
        changedAt: now,
      },
    });

    return await this.findOne(id, user);
  }

  async updateCargoReadiness(
    id: number,
    dto: { cargoReadyConfirmed?: unknown; cargoReadyDate?: unknown },
    user?: any,
    userPermissions?: Set<string>,
  ) {
    if (typeof dto.cargoReadyConfirmed !== 'boolean') {
      throw new BadRequestException(
        'Cargo readiness must be explicitly Yes or No.',
      );
    }

    let readyDate: string | null = null;
    if (dto.cargoReadyConfirmed) {
      const requestedDate = dto.cargoReadyDate;
      const requestedTimestamp =
        typeof requestedDate === 'string' ? Date.parse(requestedDate) : NaN;
      if (
        typeof requestedDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ||
        !Number.isFinite(requestedTimestamp) ||
        new Date(requestedTimestamp).toISOString().slice(0, 10) !==
          requestedDate
      ) {
        throw new BadRequestException(
          'A valid Ready Date is required when Cargo Allocation is Yes.',
        );
      }
      readyDate = requestedDate;
    }

    const shipment = await this.shipmentModel.findByPk(id, {
      include: [{ model: SalesContract, as: 'salesContract' }],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }
    if (
      user?.companyId &&
      shipment.salesContract?.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${id} not found`);
    }

    const isSuperAdmin = user?.type === 'super_admin';
    const hasPermission = (permission: string) =>
      userPermissions?.has(permission) === true;
    const hasSavedReadiness =
      shipment.cargoReadyConfirmed !== null &&
      shipment.cargoReadyConfirmed !== undefined;

    if (
      hasSavedReadiness &&
      !isSuperAdmin &&
      !hasPermission('cargo_allocation:edit_completed')
    ) {
      throw new ForbiddenException(
        'Cargo readiness is already saved and can only be changed by users with Cargo Allocation Edit Completed permission.',
      );
    }

    if (
      !hasSavedReadiness &&
      !isSuperAdmin &&
      !hasPermission('cargo_allocation:create') &&
      !hasPermission('cargo_allocation:update')
    ) {
      throw new ForbiddenException(
        'You do not have permission to create Cargo Allocation readiness.',
      );
    }

    const previousValue = {
      cargoReadyConfirmed: shipment.cargoReadyConfirmed,
      cargoReadyDate: shipment.cargoReadyDate,
    };
    shipment.cargoReadyConfirmed = dto.cargoReadyConfirmed;
    shipment.cargoReadyDate = readyDate;
    await shipment.save();

    await this.auditService.writeLog({
      clientId: user?.clientId ?? null,
      companyId: user?.companyId ?? null,
      userId: user?.userId ?? user?.id ?? null,
      entityType: 'SalesContractShipment',
      entityId: shipment.id,
      action: 'CARGO_READINESS_CHANGED',
      oldValue: previousValue,
      newValue: {
        cargoReadyConfirmed: shipment.cargoReadyConfirmed,
        cargoReadyDate: shipment.cargoReadyDate,
      },
    });

    return await this.findOne(id, user);
  }

  /**
   * Auto-populates 80-90% read-only data for Shipment Stuffing Execution
   * Fetches data from Shipment, Sales Contract, Items, Cargo Allocation, Freight, Company, and Buyer.
   */
  async getStuffingExecutionData(
    shipmentId: number,
    user?: any,
    multiShipmentIdsInput?: unknown,
  ) {
    const multiIds = parseMultiExecutionShipmentIds(
      multiShipmentIdsInput,
      shipmentId,
    );
    if (multiIds.length > 1) {
      return await this.getMultiStuffingExecutionData(
        shipmentId,
        multiIds,
        user,
      );
    }

    const shipment = await this.shipmentModel.findByPk(shipmentId, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          include: [
            { model: Partner, as: 'buyer', required: false },
            { model: Partner, as: 'seller', required: false },
            {
              model: SalesContractItem,
              as: 'items',
              required: false,
              include: [
                { model: Product, as: 'product', required: false },
                { model: PackingType, as: 'packingType', required: false },
                {
                  model: BagSpecification,
                  as: 'bagSpecification',
                  required: false,
                },
              ],
            },
            { model: Company, as: 'company', required: false },
            { model: Enquiry, as: 'enquiry', required: false },
            { model: ShipmentType, as: 'shipmentType', required: false },
            { model: PaymentTerm, as: 'paymentTerm', required: false },
          ],
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: Company,
          as: 'company',
          required: false,
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    if (
      user?.companyId &&
      shipment.salesContract?.companyId &&
      shipment.salesContract.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    // 1. Linked Purchase Contract
    let purchaseContractNo = 'N/A';
    let purchaseContractQuantity = 0;
    let allocatedQuantity = Number(shipment.quantity || 0);
    try {
      const pcShipmentModel =
        this.shipmentModel.sequelize?.models['PurchaseContractShipment'];
      const pcModel = this.shipmentModel.sequelize?.models['PurchaseContract'];
      if (pcShipmentModel && pcModel) {
        const pcLink: any = await pcShipmentModel.findOne({
          where: { shipmentId: shipment.id },
        });
        if (pcLink?.purchaseContractId) {
          if (pcLink.allocatedQuantity != null) {
            allocatedQuantity = Number(pcLink.allocatedQuantity) || 0;
          }
          const pc: any = await pcModel.findByPk(pcLink.purchaseContractId);
          if (pc) {
            if (pc.contractNumber) purchaseContractNo = pc.contractNumber;
            purchaseContractQuantity = Number(pc.quantity) || 0;
          }
        } else if (shipment.salesContractId) {
          const directPc: any = await pcModel.findOne({
            where: { salesContractId: shipment.salesContractId },
          });
          if (directPc) {
            if (directPc.contractNumber) {
              purchaseContractNo = directPc.contractNumber;
            }
            purchaseContractQuantity = Number(directPc.quantity) || 0;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch linked Purchase Contract:', err);
    }

    const allocatedCargoLotsStr = '—';
    const warehouseName = '—';
    const availableWeight = Number(shipment.quantity || 0);
    const allocatedWeight = allocatedQuantity;
    const loadedQuantity = Number(
      (await this.stuffingModel.sum('actualLoadingWeight', {
        where: { shipmentId: shipment.id },
      })) || 0,
    );
    const remainingQuantity = Math.max(
      0,
      Number(shipment.quantity || 0) - loadedQuantity,
    );

    const balanceWeight = Math.max(
      0,
      parseFloat((purchaseContractQuantity - allocatedQuantity).toFixed(2)),
    );

    // 3. Freight Info
    let freightQuote: any = null;
    let logistics: any = null;
    try {
      const freightQuoteWhere = shipment.logisticsId
        ? {
            [Op.or]: [
              { shipmentId: shipment.id },
              { logisticsId: shipment.logisticsId },
            ],
          }
        : { shipmentId: shipment.id };
      freightQuote = await this.freightQuoteModel.findOne({
        where: freightQuoteWhere,
        order: [['id', 'DESC']],
      });

      const transportRecordId =
        freightQuote?.logisticsId || shipment.logisticsId;
      if (transportRecordId) {
        logistics = await this.logisticsModel.findByPk(transportRecordId);
      }
    } catch (err) {
      console.warn('Could not fetch freight transport data for stuffing:', err);
    }

    // 4. Extract Shipment & Contract Data
    const contract = shipment.salesContract || ({} as any);
    const item = contract.items?.[0] || {};
    const product = item.product || {};
    const buyer = contract.buyer || {};
    const seller = contract.seller || {};
    const company = shipment.company || contract.company || {};

    const bagSizeKg = Number(item.bagSpecification?.size || 0);
    const quantityMt = Number(shipment.quantity || 0);
    const totalBags = bagSizeKg
      ? Math.round((quantityMt * 1000) / bagSizeKg)
      : 0;

    let pcLoadingPlace: string | null = null;
    try {
      const [pcLoadingRows]: any = await this.sequelize.query(
        `SELECT pc.place_of_loading
         FROM purchase_contracts pc
         LEFT JOIN purchase_contract_shipments pcs ON pcs.purchase_contract_id = pc.id
         WHERE pcs.shipment_id = :shipmentId
            OR pc.sales_contract_id = :salesContractId
         ORDER BY CASE WHEN pcs.shipment_id = :shipmentId THEN 1 ELSE 2 END, pc.updated_at DESC
         LIMIT 1`,
        {
          replacements: {
            shipmentId,
            salesContractId: contract.id || -1,
          },
        },
      );
      if (pcLoadingRows?.[0]?.place_of_loading) {
        pcLoadingPlace = pcLoadingRows[0].place_of_loading;
      }
    } catch (e) {
      // ignore
    }

    const originPort =
      pcLoadingPlace ||
      shipment.origin ||
      contract.portOfLoading ||
      contract.originLocationName ||
      freightQuote?.pol ||
      '—';
    const destPort =
      getContractDestination(contract) ||
      contract.deliveryPlace ||
      shipment.destination ||
      freightQuote?.pod ||
      '—';
    const originCountry = contract.originCountry || '—';
    const destCountry = contract.destinationCountry || '—';
    const route = `${originPort} ➔ ${destPort}`;

    // Company Details
    const sellerCompanyName =
      company.legalName || company.name || seller.entityName || '—';
    const sellerAddress =
      [
        company.address,
        company.city,
        company.state,
        company.country,
        company.pincode,
      ]
        .filter(Boolean)
        .join(', ') ||
      seller.address ||
      '—';
    const sellerGst = company.taxNumber || seller.taxId || '—';
    const sellerIec = company.registrationNumber || seller.panNo || '—';
    const sellerContact =
      [company.phone, company.email].filter(Boolean).join(' | ') ||
      seller.contactEmail ||
      '—';

    // Buyer Details
    const buyerName = buyer.entityName || '—';
    const buyerAddress = buyer.address
      ? `${buyer.address}, ${buyer.city || ''}, ${buyer.country || ''}`
      : buyer.loadingAddress || '—';
    const buyerCountry = buyer.country || destCountry;
    const buyerContactPerson = buyer.contacts?.[0]
      ? `${buyer.contacts[0].contactName || ''} (${buyer.contacts[0].contactNumber || buyer.contacts[0].email || ''})`
      : buyer.contactEmail || '—';

    // Build the complete auto-populated object (80-90% read only data)
    const autoPopulated = {
      // From Shipment
      shipmentRef: shipment.shipmentReference || '—',
      businessRefNo: shipment.businessTransaction?.businessReference || '—',
      salesContractNo: contract.contractNumber || '—',
      purchaseContractNo: purchaseContractNo,
      enquiryRef:
        contract.enquiry?.enquiryReference ||
        (contract.enquiryId
          ? `ENQ-${String(contract.enquiryId).slice(0, 8)}`
          : '—'),
      buyer: buyerName,
      seller: sellerCompanyName,
      product: product.name || '—',
      commodityGrade:
        product.grade || product.commodityGrade || item.remarks || '—',
      quantityMt: quantityMt,
      packingType: item.packingType?.name || '—',
      bagSize: bagSizeKg ? `${bagSizeKg} Kg` : '—',
      totalBags: totalBags,
      incoterm:
        contract.shipmentType?.code ||
        contract.shipmentType?.name ||
        contract.contractType ||
        '—',
      paymentTerms: contract.paymentTerm?.name || '—',
      paymentTerm: contract.paymentTerm?.name || '—',
      shipmentDate: shipment.shipmentDate,
      transportMode:
        freightQuote?.transportMode ||
        logistics?.transportMode ||
        contract.transportMode ||
        contract.originTransportMode ||
        null,
      freightType: contract.shipmentType?.name || freightQuote?.mode || '—',
      shipmentType: contract.contractType || contract.shipmentType?.name || '—',
      route: route,
      originCountry: originCountry,
      destinationCountry: destCountry,
      originPort: originPort,
      destinationPort: destPort,

      // From Cargo Allocation
      allocatedCargoLots: allocatedCargoLotsStr,
      warehouse: warehouseName,
      availableWeight: availableWeight,
      allocatedWeight: allocatedWeight,
      allocatedQuantity: allocatedWeight,
      balanceWeight: balanceWeight,
      loadedQuantity,
      remainingQuantity,

      // From Freight (defaults, editable if not available)
      shippingLine: freightQuote?.shippingLine || '',
      vessel: freightQuote?.vessel || '',
      voyage: freightQuote?.voyage || '',
      containerType:
        freightQuote?.containerType ||
        freightQuote?.containerSize ||
        (shipment.noOfContainers
          ? `${shipment.noOfContainers} container(s)`
          : '—'),
      freightForwarder:
        freightQuote?.seller?.entityName ||
        freightQuote?.carrierReferenceNo ||
        '',
      etd: freightQuote?.etd
        ? new Date(freightQuote.etd).toISOString().split('T')[0]
        : shipment.shipmentDate
          ? new Date(shipment.shipmentDate).toISOString().split('T')[0]
          : '',
      eta: freightQuote?.eta
        ? new Date(freightQuote.eta).toISOString().split('T')[0]
        : '',
      pol: freightQuote?.pol || originPort,
      pod: freightQuote?.pod || destPort,

      // From Company
      sellerCompany: sellerCompanyName,
      sellerAddress: sellerAddress,
      gst: sellerGst,
      iec: sellerIec,
      contactDetails: sellerContact,

      // From Buyer
      buyerName: buyerName,
      buyerAddress: buyerAddress,
      buyerCountry: buyerCountry,
      buyerContactPerson: buyerContactPerson,
    };

    // Check existing stuffing record
    let existingStuffing = null;
    try {
      existingStuffing = await this.stuffingModel.findOne({
        where: { shipmentId: shipment.id },
      });
      if (
        !existingStuffing &&
        ['Executed', 'Stuffed', 'Dispatched', 'Completed'].includes(
          shipment.status,
        )
      ) {
        await this.ensureExecutionRecordsForShipmentId(
          shipment.id,
          user?.userId ?? user?.id ?? null,
        );
        existingStuffing = await this.stuffingModel.findOne({
          where: { shipmentId: shipment.id },
        });
      }
    } catch (err) {
      console.warn('Could not query existing stuffing:', err);
    }

    // Evaluate readiness
    let readyForShipment = false;
    let isManualOverride = false;
    try {
      const readiness = await this.readinessService.evaluate(shipment);
      readyForShipment = readiness.readyForShipment;
      isManualOverride = readiness.isManualOverride;
    } catch (err) {
      console.warn('Readiness evaluate warning:', err);
    }

    const existingStuffingData = existingStuffing
      ? existingStuffing.get({ plain: true })
      : null;
    if (existingStuffingData?.containers) {
      existingStuffingData.containers = this.stripRemovedContainerFields(
        existingStuffingData.containers,
      );
    }
    if (existingStuffingData) {
      existingStuffingData.downtimes = Array.isArray(
        existingStuffingData.downtimes,
      )
        ? existingStuffingData.downtimes
        : [];

      const attachments = Array.isArray(existingStuffingData.attachments)
        ? existingStuffingData.attachments
        : [];
      const attachmentIds = [
        ...new Set<number>(
          attachments
            .map((attachment): number => Number(attachment?.attachmentId))
            .filter((id): id is number => Number.isInteger(id) && id > 0),
        ),
      ];

      if (attachmentIds.length > 0) {
        const storedAttachments = await this.attachmentModel.findAll({
          where: { id: { [Op.in]: attachmentIds } },
          attributes: ['id', 'originalName', 'fileSize', 'mimeType'],
        });
        const storedById = new Map(
          storedAttachments.map((attachment) => [attachment.id, attachment]),
        );

        existingStuffingData.attachments = attachments.map((attachment) => {
          const stored = storedById.get(Number(attachment?.attachmentId));
          if (!stored) return attachment;

          const downloadUrl = `/attachments/${stored.id}/download`;
          return {
            ...attachment,
            fileName: attachment.fileName || stored.originalName,
            fileUrl: attachment.fileUrl || downloadUrl,
            downloadUrl: attachment.downloadUrl || downloadUrl,
            fileSize: Number(attachment.fileSize) || stored.fileSize,
            mimeType: attachment.mimeType || stored.mimeType,
          };
        });
      }
    }

    return {
      shipmentId: shipment.id,
      shipmentStatus: shipment.status,
      readyForShipment,
      isManualOverride,
      autoPopulated,
      existingStuffing: existingStuffingData,
    };
  }

  /**
   * Checks if shipment stuffing execution is already finalized and enforces RBAC override.
   */
  async assertCanModifyStuffing(
    shipmentId: number,
    user?: any,
    userPermissions?: Set<string>,
  ) {
    const existingStuffing = await this.stuffingModel.findOne({
      where: { shipmentId },
    });
    const existingShipment = await this.shipmentModel.findByPk(shipmentId);
    if (existingShipment) {
      const isAlreadyCompleted =
        existingStuffing?.stuffingStatus === 'Completed' ||
        ['Executed', 'Dispatched', 'Completed'].includes(
          existingShipment.status,
        ) ||
        existingStuffing?.executionStatus === 'Loading Completed' ||
        existingStuffing?.executionStatus === 'Stuffed';

      return assertCanModifyRecord({
        isCompleted: isAlreadyCompleted,
        oneTimeEditUsed: existingStuffing?.oneTimeCompletedEditUsed,
        user,
        userPermissions,
        resource: 'shipment_stuffing_execution',
        recordType: 'Shipment Stuffing Execution',
        customMessage:
          'Shipment stuffing execution is completed and the 1-time correction has already been used. You need the "shipment_stuffing_execution:edit_completed" permission to modify completed stuffing records.',
      });
    }
    return {
      allowed: true,
      isCompleted: false,
      isOverride: false,
      isOneTimeEdit: false,
    };
  }

  /**
   * Saves stuffing execution (Save as Draft OR Complete Stuffing)
   */
  async saveStuffingExecution(
    shipmentId: number,
    dto: any,
    user?: any,
    userPermissions?: Set<string>,
  ) {
    const multiIds = parseMultiExecutionShipmentIds(
      dto?.shipmentIds,
      shipmentId,
    );
    if (multiIds.length > 1) {
      return await this.saveMultiStuffingExecution(
        shipmentId,
        multiIds,
        dto,
        user,
        userPermissions,
      );
    }

    const access = await this.assertCanModifyStuffing(
      shipmentId,
      user,
      userPermissions,
    );
    const userId = user?.userId ?? user?.id ?? null;
    const isComplete = dto.action === 'complete';
    const isExecutionTransition =
      isComplete ||
      dto.action === 'dispatch' ||
      [
        'Executed',
        'Stuffed',
        'Loading Completed',
        'Dispatched',
        'Completed',
      ].includes(String(dto.executionStatus || ''));
    const now = new Date();
    if (isExecutionTransition) {
      const requiredLoadingFields: Array<[string, string]> = [
        ['loadingDate', 'Date of Loading'],
        ['actualLoadingWeight', 'Actual Loading Weight (MT)'],
        ['grossWeight', 'Gross Weight (MT)'],
        ['netWeight', 'Net Weight (MT)'],
        ['loadingStartTime', 'Loading Start Time'],
        ['loadingEndTime', 'Loading End Time'],
      ];
      const missingFields = requiredLoadingFields
        .filter(([field]) => {
          const value = dto[field];
          return (
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim() === '')
          );
        })
        .map(([, label]) => label);

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Complete all required Loading & Weights fields before completing stuffing: ${missingFields.join(', ')}.`,
        );
      }

      const invalidWeightFields = requiredLoadingFields
        .filter(([field]) =>
          ['actualLoadingWeight', 'grossWeight', 'netWeight'].includes(field),
        )
        .filter(([field]) => !Number.isFinite(Number(dto[field])))
        .map(([, label]) => label);

      if (invalidWeightFields.length > 0) {
        throw new BadRequestException(
          `Enter valid numbers for: ${invalidWeightFields.join(', ')}.`,
        );
      }

      const dispatchMode =
        dto.dispatchMode === 'container'
          ? 'container'
          : dto.dispatchMode === 'truck'
            ? 'truck'
            : /\bSEA\b|CONTAINER|OCEAN|MARITIME/i.test(
                  String(dto.autoPopulated?.transportMode || ''),
                )
              ? 'container'
              : 'truck';
      const dispatchRows =
        dispatchMode === 'container' ? dto.containers : dto.trucks;
      if (
        !Array.isArray(dispatchRows) ||
        dispatchRows.length === 0 ||
        dispatchRows.some(
          (row) =>
            !['yes', 'no'].includes(String(row?.dispatch || '').toLowerCase()),
        )
      ) {
        throw new BadRequestException(
          'Select Dispatch (Yes or No) for every container or truck before completing stuffing.',
        );
      }
    }

    const { shipment, record, stuffingData } = await this.sequelize.transaction(
      async (transaction) => {
        const shipment = await this.shipmentModel.findByPk(shipmentId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!shipment) {
          throw new NotFoundException(`Shipment #${shipmentId} not found`);
        }

        if (isExecutionTransition) {
          if (shipment.cargoReadyConfirmed !== true) {
            throw new BadRequestException(
              'Cargo Allocation must be marked Yes before completing shipment stuffing.',
            );
          }
        }

        const stuffingData: any = {
          companyId: shipment.companyId || user?.companyId || null,
          shipmentId: shipment.id,
          salesContractId: shipment.salesContractId,
          stuffingStatus: isComplete
            ? 'Completed'
            : dto.stuffingStatus || 'Draft',
          executionStatus: isComplete
            ? 'Loading Completed'
            : dto.executionStatus || 'Pending',
          warehouseStatus: isComplete
            ? 'Completed'
            : dto.warehouseStatus || 'Pending',
          loadingStatus: isComplete
            ? 'Loading Completed'
            : dto.loadingStatus || 'Pending',
          autoPopulatedData: dto.autoPopulated || {},
          stuffingDate: dto.stuffingDate || null,
          stuffingStartTime: dto.stuffingStartTime || null,
          stuffingEndTime: dto.stuffingEndTime || null,
          stuffingLocation: dto.stuffingLocation || null,
          supervisor: dto.supervisor || null,
          operator: dto.operator || null,
          loadingDate: dto.loadingDate || null,
          loadingStartTime: dto.loadingStartTime || null,
          loadingEndTime: dto.loadingEndTime || null,
          actualLoadingWeight: dto.actualLoadingWeight
            ? Number(dto.actualLoadingWeight)
            : 0,
          grossWeight: dto.grossWeight ? Number(dto.grossWeight) : 0,
          netWeight: dto.netWeight ? Number(dto.netWeight) : 0,
          freightOverrides: dto.freightOverrides || null,
          containers: this.stripRemovedContainerFields(
            Array.isArray(dto.containers) ? dto.containers : [],
          ),
          downtimes: this.normalizeDowntimeRecords(dto.downtimes),
          trucks: Array.isArray(dto.trucks) ? dto.trucks : [],
          attachments: Array.isArray(dto.attachments) ? dto.attachments : [],
          remarks: dto.remarks || null,
          updatedBy: userId,
          ...(isComplete ? { completedAt: now } : {}),
        };

        const loadedQty = Number(stuffingData.actualLoadingWeight);
        if (!Number.isFinite(loadedQty) || loadedQty < 0) {
          throw new BadRequestException('Loaded quantity cannot be negative.');
        }
        if (isComplete && loadedQty <= 0) {
          throw new BadRequestException(
            'Enter a positive loaded quantity before completing stuffing.',
          );
        }
        if (loadedQty > Number(shipment.quantity || 0)) {
          throw new BadRequestException(
            `Loaded quantity (${loadedQty} MT) exceeds shipment quantity (${shipment.quantity} MT).`,
          );
        }
        const containerNumbers = stuffingData.containers
          .map((container: any) =>
            String(container.containerNo || '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean);
        if (new Set(containerNumbers).size !== containerNumbers.length) {
          throw new BadRequestException(
            'Container numbers must be unique within the stuffing job.',
          );
        }
        for (const containerNo of [...containerNumbers].sort()) {
          await this.sequelize.query(
            'SELECT pg_advisory_xact_lock(hashtext(:containerNo))',
            {
              replacements: { containerNo },
              transaction,
            },
          );
        }
        if (containerNumbers.length > 0) {
          const otherStuffings = await this.stuffingModel.findAll({
            where: { shipmentId: { [Op.ne]: shipment.id } },
            attributes: ['containers'],
            transaction,
          });
          const existingContainerNumbers = new Set(
            otherStuffings.flatMap((stuffing) =>
              (stuffing.containers || [])
                .map((container: any) =>
                  String(container.containerNo || '')
                    .trim()
                    .toUpperCase(),
                )
                .filter(Boolean),
            ),
          );
          const duplicateContainer = containerNumbers.find(
            (containerNo: string) => existingContainerNumbers.has(containerNo),
          );
          if (duplicateContainer) {
            throw new BadRequestException(
              `Container ${duplicateContainer} is already assigned to another stuffing job.`,
            );
          }
        }
        for (const container of stuffingData.containers) {
          for (const field of ['tareWeight', 'grossWeight', 'netWeight']) {
            const value = Number(container[field] || 0);
            if (!Number.isFinite(value) || value < 0) {
              throw new BadRequestException(
                `Container ${field} cannot be negative.`,
              );
            }
          }
        }

        const [record] = await this.stuffingModel.findOrCreate({
          where: { shipmentId },
          defaults: { ...stuffingData, createdBy: userId },
          transaction,
        });

        if (access?.isOneTimeEdit) {
          stuffingData.oneTimeCompletedEditUsed = true;
          stuffingData.oneTimeCompletedEditBy = userId;
          stuffingData.oneTimeCompletedEditAt = now;
        }

        await record.update(stuffingData, { transaction });

        const effectiveExecutionStatus = isComplete
          ? 'Loading Completed'
          : dto.executionStatus || stuffingData.executionStatus || 'Pending';

        if (
          effectiveExecutionStatus === 'Dispatched' ||
          dto.action === 'dispatch'
        ) {
          shipment.status = 'Dispatched';
          shipment.executionStatus = 'Dispatched';
          shipment.manualReadyOverride = true;
          shipment.manualReadyReason = 'Dispatched';
          shipment.manualReadyAt = now;
          shipment.manualReadyBy = userId;
          await shipment.save({ transaction });
        } else if (effectiveExecutionStatus === 'Completed') {
          shipment.status = 'Completed';
          shipment.executionStatus = 'Completed';
          shipment.manualReadyOverride = true;
          shipment.manualReadyReason = 'Completed';
          shipment.manualReadyAt = now;
          shipment.manualReadyBy = userId;
          await shipment.save({ transaction });
        } else if (isComplete) {
          shipment.status = 'Executed';
          shipment.executionStatus = 'Loading Completed';
          shipment.manualReadyOverride = true;
          shipment.manualReadyReason = 'Stuffing Completed';
          shipment.manualReadyAt = now;
          shipment.manualReadyBy = userId;
          await shipment.save({ transaction });
        } else {
          shipment.executionStatus = effectiveExecutionStatus;
          await shipment.save({ transaction });
        }

        return { shipment, record, stuffingData };
      },
    );

    if (isComplete) {
      if (shipment.salesContractId) {
        await this.purchaseContractService
          .ensureExists(shipment.salesContractId, userId)
          .catch((err) => {
            console.warn(
              '[ShipmentService] ensureExists non-fatal warning:',
              err?.message,
            );
          });
      }

      await this.auditService.writeLog({
        clientId: user?.clientId ?? null,
        companyId: user?.companyId ?? null,
        userId,
        entityType: 'SalesContractShipment',
        entityId: shipment.id,
        action: 'STUFFING_EXECUTION_COMPLETED',
        oldValue: null,
        newValue: {
          stuffingId: record.id,
          stuffingStatus: 'Completed',
          executionStatus: 'Stuffed',
          actualLoadingWeight: stuffingData.actualLoadingWeight,
          containersCount: stuffingData.containers.length,
          trucksCount: stuffingData.trucks.length,
          completedAt: now,
        },
      });
    }

    return {
      success: true,
      message: isComplete
        ? 'Stuffing completed successfully'
        : 'Stuffing draft saved successfully',
      record,
      shipmentStatus: shipment.status,
      readyForShipment: true,
    };
  }

  private async hydrateExistingStuffingRecord(existingStuffing: any) {
    const existingStuffingData = existingStuffing
      ? existingStuffing.get({ plain: true })
      : null;
    if (existingStuffingData?.containers) {
      existingStuffingData.containers = this.stripRemovedContainerFields(
        existingStuffingData.containers,
      );
    }
    if (existingStuffingData) {
      existingStuffingData.downtimes = Array.isArray(
        existingStuffingData.downtimes,
      )
        ? existingStuffingData.downtimes
        : [];

      const attachments = Array.isArray(existingStuffingData.attachments)
        ? existingStuffingData.attachments
        : [];
      const attachmentIds = [
        ...new Set<number>(
          attachments
            .map((attachment): number => Number(attachment?.attachmentId))
            .filter((id): id is number => Number.isInteger(id) && id > 0),
        ),
      ];

      if (attachmentIds.length > 0) {
        const storedAttachments = await this.attachmentModel.findAll({
          where: { id: { [Op.in]: attachmentIds } },
          attributes: ['id', 'originalName', 'fileSize', 'mimeType'],
        });
        const storedById = new Map(
          storedAttachments.map((attachment) => [attachment.id, attachment]),
        );

        existingStuffingData.attachments = attachments.map((attachment) => {
          const stored = storedById.get(Number(attachment?.attachmentId));
          if (!stored) return attachment;

          const downloadUrl = `/attachments/${stored.id}/download`;
          return {
            ...attachment,
            fileName: attachment.fileName || stored.originalName,
            fileUrl: attachment.fileUrl || downloadUrl,
            downloadUrl: attachment.downloadUrl || downloadUrl,
            fileSize: Number(attachment.fileSize) || stored.fileSize,
            mimeType: attachment.mimeType || stored.mimeType,
          };
        });
      }
    }
    return existingStuffingData;
  }

  private validateExecutionTransitionDto(dto: any): boolean {
    const isComplete = dto.action === 'complete';
    const isExecutionTransition =
      isComplete ||
      dto.action === 'dispatch' ||
      [
        'Executed',
        'Stuffed',
        'Loading Completed',
        'Dispatched',
        'Completed',
      ].includes(String(dto.executionStatus || ''));

    if (!isExecutionTransition) {
      return false;
    }

    const requiredLoadingFields: Array<[string, string]> = [
      ['loadingDate', 'Date of Loading'],
      ['actualLoadingWeight', 'Actual Loading Weight (MT)'],
      ['grossWeight', 'Gross Weight (MT)'],
      ['netWeight', 'Net Weight (MT)'],
      ['loadingStartTime', 'Loading Start Time'],
      ['loadingEndTime', 'Loading End Time'],
    ];
    const missingFields = requiredLoadingFields
      .filter(([field]) => {
        const value = dto[field];
        return (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        );
      })
      .map(([, label]) => label);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Complete all required Loading & Weights fields before completing stuffing: ${missingFields.join(', ')}.`,
      );
    }

    const invalidWeightFields = requiredLoadingFields
      .filter(([field]) =>
        ['actualLoadingWeight', 'grossWeight', 'netWeight'].includes(field),
      )
      .filter(([field]) => !Number.isFinite(Number(dto[field])))
      .map(([, label]) => label);

    if (invalidWeightFields.length > 0) {
      throw new BadRequestException(
        `Enter valid numbers for: ${invalidWeightFields.join(', ')}.`,
      );
    }

    const dispatchMode =
      dto.dispatchMode === 'container'
        ? 'container'
        : dto.dispatchMode === 'truck'
          ? 'truck'
          : /\bSEA\b|CONTAINER|OCEAN|MARITIME/i.test(
                String(dto.autoPopulated?.transportMode || ''),
              )
            ? 'container'
            : 'truck';
    const dispatchRows =
      dispatchMode === 'container' ? dto.containers : dto.trucks;
    if (
      !Array.isArray(dispatchRows) ||
      dispatchRows.length === 0 ||
      dispatchRows.some(
        (row) =>
          !['yes', 'no'].includes(String(row?.dispatch || '').toLowerCase()),
      )
    ) {
      throw new BadRequestException(
        'Select Dispatch (Yes or No) for every container or truck before completing stuffing.',
      );
    }

    return true;
  }

  private async getMultiStuffingExecutionData(
    primaryShipmentId: number,
    multiIds: number[],
    user?: any,
  ) {
    const fetchedShipments = await this.shipmentModel.findAll({
      where: { id: { [Op.in]: multiIds } },
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          include: [
            { model: Partner, as: 'buyer', required: false },
            { model: Partner, as: 'seller', required: false },
            {
              model: SalesContractItem,
              as: 'items',
              required: false,
              include: [
                { model: Product, as: 'product', required: false },
                { model: PackingType, as: 'packingType', required: false },
                {
                  model: BagSpecification,
                  as: 'bagSpecification',
                  required: false,
                },
              ],
            },
            { model: Company, as: 'company', required: false },
            { model: Enquiry, as: 'enquiry', required: false },
            { model: ShipmentType, as: 'shipmentType', required: false },
            { model: PaymentTerm, as: 'paymentTerm', required: false },
          ],
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        {
          model: Company,
          as: 'company',
          required: false,
        },
      ],
    });

    const shipmentById = new Map<number, SalesContractShipment>(
      fetchedShipments.map((s) => [Number(s.id), s]),
    );
    const orderedShipments = multiIds
      .map((id) => shipmentById.get(id))
      .filter((s): s is SalesContractShipment => Boolean(s));

    if (orderedShipments.length !== multiIds.length) {
      const missingId = multiIds.find((id) => !shipmentById.has(id));
      throw new NotFoundException(`Shipment #${missingId ?? primaryShipmentId} not found`);
    }

    for (const s of orderedShipments) {
      if (
        user?.companyId &&
        s.salesContract?.companyId &&
        s.salesContract.companyId !== user.companyId
      ) {
        throw new NotFoundException(`Shipment #${s.id} not found`);
      }
    }

    const contractIds = new Set(
      orderedShipments.map((s) => Number(s.salesContractId || 0)),
    );
    if (contractIds.has(0) || contractIds.size !== 1) {
      this.logMultiExecutionContractMismatch(
        'getMultiStuffingExecutionData',
        orderedShipments,
        contractIds,
      );
      throw new BadRequestException(
        'Multi-shipment execution is allowed only for shipments belonging to the same Sales Contract.',
      );
    }

    const primaryShipment = orderedShipments[0];
    const contract = primaryShipment.salesContract || ({} as any);
    const modeCategory = getMultiExecutionTransportCategory(contract);
    if (!modeCategory) {
      throw new BadRequestException(
        'Multi-shipment execution is supported only for Truck and Rail Freight / Wagon shipments.',
      );
    }

    // 1. Purchase Contracts & allocated quantities across selected shipments
    const pcNumbers = new Set<string>();
    let purchaseContractQuantity = 0;
    const allocatedByShipment = new Map<number, number>(
      orderedShipments.map((s) => [Number(s.id), Number(s.quantity || 0)]),
    );

    try {
      const pcShipmentModel =
        this.shipmentModel.sequelize?.models?.['PurchaseContractShipment'];
      const pcModel =
        this.shipmentModel.sequelize?.models?.['PurchaseContract'];
      if (pcShipmentModel && pcModel) {
        const pcLinks: any[] = await pcShipmentModel.findAll({
          where: { shipmentId: { [Op.in]: multiIds } },
        });
        const pcIds = Array.from(
          new Set(
            pcLinks
              .map((l) => Number(l?.purchaseContractId))
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          ),
        );
        for (const link of pcLinks) {
          if (link?.shipmentId && link?.allocatedQuantity != null) {
            allocatedByShipment.set(
              Number(link.shipmentId),
              Number(link.allocatedQuantity) || 0,
            );
          }
        }
        if (pcIds.length > 0 && typeof pcModel.findAll === 'function') {
          const pcs: any[] = await pcModel.findAll({
            where: { id: { [Op.in]: pcIds } },
          });
          for (const pc of pcs) {
            if (pc?.contractNumber) pcNumbers.add(String(pc.contractNumber));
            purchaseContractQuantity += Number(pc?.quantity || 0);
          }
        } else if (primaryShipment.salesContractId) {
          const directPc: any = await pcModel.findOne({
            where: { salesContractId: primaryShipment.salesContractId },
          });
          if (directPc) {
            if (directPc.contractNumber) {
              pcNumbers.add(String(directPc.contractNumber));
            }
            purchaseContractQuantity = Number(directPc.quantity || 0);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch linked Purchase Contracts:', err);
    }

    const purchaseContractNo =
      pcNumbers.size > 0 ? Array.from(pcNumbers).join(', ') : 'N/A';

    const totalQuantityMt = orderedShipments.reduce(
      (sum, s) => sum + Number(s.quantity || 0),
      0,
    );
    const totalAllocatedWeight = orderedShipments.reduce(
      (sum, s) => sum + Number(allocatedByShipment.get(Number(s.id)) || 0),
      0,
    );

    let loadedQuantity = 0;
    try {
      loadedQuantity = Number(
        (await this.stuffingModel.sum('actualLoadingWeight', {
          where: { shipmentId: { [Op.in]: multiIds } },
        })) || 0,
      );
    } catch {
      loadedQuantity = 0;
    }

    const remainingQuantity = Math.max(0, totalQuantityMt - loadedQuantity);
    const balanceWeight = Math.max(
      0,
      parseFloat((purchaseContractQuantity - totalAllocatedWeight).toFixed(2)),
    );

    // 2. Fetch Freight Quotes independently per shipment (never share Truck freight between shipments)
    const quoteByShipment = new Map<number, any>();
    let primaryLogistics: any = null;
    try {
      if (typeof this.freightQuoteModel?.findAll === 'function') {
        const quotes: any[] = await this.freightQuoteModel.findAll({
          where: { shipmentId: { [Op.in]: multiIds } },
          order: [['id', 'DESC']],
        });
        for (const q of quotes || []) {
          const sId = Number(q?.shipmentId);
          if (sId && !quoteByShipment.has(sId)) {
            quoteByShipment.set(sId, q);
          }
        }
      } else if (typeof this.freightQuoteModel?.findOne === 'function') {
        for (const s of orderedShipments) {
          const q = await this.freightQuoteModel.findOne({
            where: { shipmentId: s.id },
            order: [['id', 'DESC']],
          });
          if (q) quoteByShipment.set(Number(s.id), q);
        }
      }

      const primaryFreightQuote = quoteByShipment.get(Number(primaryShipment.id));
      const logisticsId =
        primaryFreightQuote?.logisticsId || primaryShipment.logisticsId;
      if (logisticsId && typeof this.logisticsModel?.findByPk === 'function') {
        primaryLogistics = await this.logisticsModel.findByPk(logisticsId);
      }
    } catch (err) {
      console.warn('Could not fetch multi-shipment freight data:', err);
    }

    const primaryFreightQuote = quoteByShipment.get(Number(primaryShipment.id)) || null;
    const perShipmentFreights = orderedShipments.map((s) => {
      const q = quoteByShipment.get(Number(s.id)) || null;
      return {
        shipmentId: s.id,
        shipmentReference: s.shipmentReference || `SHP-${s.id}`,
        quoteNumber: q?.quoteNumber || null,
        freightForwarder:
          q?.seller?.entityName || q?.carrierReferenceNo || null,
        freightAmount: q?.freightAmount ?? s.freight ?? null,
        currency: q?.currency || s.freightCurrency || null,
        freightAllocationStatus: s.freightAllocationStatus || (q ? 'Yes' : 'No'),
      };
    });

    // 3. Common master data (once per Sales Contract)
    const item = contract.items?.[0] || {};
    const product = item.product || {};
    const buyer = contract.buyer || {};
    const seller = contract.seller || {};
    const company = primaryShipment.company || contract.company || {};
    const bagSizeKg = Number(item.bagSpecification?.size || 0);
    const totalBags = bagSizeKg
      ? Math.round((totalQuantityMt * 1000) / bagSizeKg)
      : 0;

    let pcLoadingPlace: string | null = null;
    try {
      const [pcLoadingRows]: any = await this.sequelize.query(
        `SELECT pc.place_of_loading
         FROM purchase_contracts pc
         LEFT JOIN purchase_contract_shipments pcs ON pcs.purchase_contract_id = pc.id
         WHERE pcs.shipment_id IN (:multiIds)
            OR pc.sales_contract_id = :salesContractId
         ORDER BY CASE WHEN pcs.shipment_id IN (:multiIds) THEN 1 ELSE 2 END, pc.updated_at DESC
         LIMIT 1`,
        {
          replacements: {
            multiIds,
            salesContractId: contract.id || -1,
          },
        },
      );
      if (pcLoadingRows?.[0]?.place_of_loading) {
        pcLoadingPlace = pcLoadingRows[0].place_of_loading;
      }
    } catch {
      // ignore
    }

    const originPort =
      pcLoadingPlace ||
      primaryShipment.origin ||
      contract.portOfLoading ||
      contract.originLocationName ||
      primaryFreightQuote?.pol ||
      '—';
    const destPort =
      getContractDestination(contract) ||
      contract.deliveryPlace ||
      primaryShipment.destination ||
      primaryFreightQuote?.pod ||
      '—';
    const originCountry = contract.originCountry || '—';
    const destCountry = contract.destinationCountry || '—';
    const route = `${originPort} ➔ ${destPort}`;

    const sellerCompanyName =
      company.legalName || company.name || seller.entityName || '—';
    const sellerAddress =
      [
        company.address,
        company.city,
        company.state,
        company.country,
        company.pincode,
      ]
        .filter(Boolean)
        .join(', ') ||
      seller.address ||
      '—';
    const sellerGst = company.taxNumber || seller.taxId || '—';
    const sellerIec = company.registrationNumber || seller.panNo || '—';
    const sellerContact =
      [company.phone, company.email].filter(Boolean).join(' | ') ||
      seller.contactEmail ||
      '—';

    const buyerName = buyer.entityName || '—';
    const buyerAddress = buyer.address
      ? `${buyer.address}, ${buyer.city || ''}, ${buyer.country || ''}`
      : buyer.loadingAddress || '—';
    const buyerCountry = buyer.country || destCountry;
    const buyerContactPerson = buyer.contacts?.[0]
      ? `${buyer.contacts[0].contactName || ''} (${buyer.contacts[0].contactNumber || buyer.contacts[0].email || ''})`
      : buyer.contactEmail || '—';

    const selectedShipmentsSummary = orderedShipments.map((s) => ({
      id: s.id,
      shipmentNo: s.shipmentNo,
      shipmentReference: s.shipmentReference || `SHP-${s.id}`,
      shipmentDate: s.shipmentDate,
      quantity: Number(s.quantity || 0),
      allocatedWeight: Number(allocatedByShipment.get(Number(s.id)) || 0),
      status: s.status,
      executionStatus: s.executionStatus || 'Pending',
      freightAllocationStatus: s.freightAllocationStatus || 'No',
    }));

    const isTruckMode = modeCategory === 'truck';
    const freightQuoteForDisplay = isTruckMode ? null : primaryFreightQuote;

    const autoPopulated = {
      isMultiShipment: true,
      multiShipmentMode: modeCategory,
      shipmentIds: multiIds,
      selectedShipments: selectedShipmentsSummary,
      perShipmentFreights,
      shipmentRef: selectedShipmentsSummary
        .map((s) => s.shipmentReference)
        .join(', '),
      businessRefNo: primaryShipment.businessTransaction?.businessReference || '—',
      salesContractNo: contract.contractNumber || '—',
      purchaseContractNo,
      enquiryRef:
        contract.enquiry?.enquiryReference ||
        (contract.enquiryId
          ? `ENQ-${String(contract.enquiryId).slice(0, 8)}`
          : '—'),
      buyer: buyerName,
      seller: sellerCompanyName,
      product: product.name || '—',
      commodityGrade:
        product.grade || product.commodityGrade || item.remarks || '—',
      quantityMt: totalQuantityMt,
      packingType: item.packingType?.name || '—',
      bagSize: bagSizeKg ? `${bagSizeKg} Kg` : '—',
      totalBags,
      incoterm:
        contract.shipmentType?.code ||
        contract.shipmentType?.name ||
        contract.contractType ||
        '—',
      paymentTerms: contract.paymentTerm?.name || '—',
      paymentTerm: contract.paymentTerm?.name || '—',
      shipmentDate: primaryShipment.shipmentDate,
      transportMode:
        modeCategory === 'rail'
          ? 'Rail'
          : primaryLogistics?.transportMode ||
            contract.originTransportMode ||
            contract.transportMode ||
            'Truck',
      freightType:
        contract.shipmentType?.name || freightQuoteForDisplay?.mode || '—',
      shipmentType:
        contract.contractType || contract.shipmentType?.name || '—',
      route,
      originCountry,
      destinationCountry: destCountry,
      originPort,
      destinationPort: destPort,
      allocatedCargoLots: '—',
      warehouse: '—',
      availableWeight: totalQuantityMt,
      allocatedWeight: totalAllocatedWeight,
      balanceWeight,
      loadedQuantity,
      remainingQuantity,
      shippingLine: freightQuoteForDisplay?.shippingLine || '',
      vessel: freightQuoteForDisplay?.vessel || '',
      voyage: freightQuoteForDisplay?.voyage || '',
      containerType: '—',
      freightForwarder:
        freightQuoteForDisplay?.seller?.entityName ||
        freightQuoteForDisplay?.carrierReferenceNo ||
        '',
      etd: freightQuoteForDisplay?.etd
        ? new Date(freightQuoteForDisplay.etd).toISOString().split('T')[0]
        : primaryShipment.shipmentDate
          ? new Date(primaryShipment.shipmentDate).toISOString().split('T')[0]
          : '',
      eta: freightQuoteForDisplay?.eta
        ? new Date(freightQuoteForDisplay.eta).toISOString().split('T')[0]
        : '',
      pol: freightQuoteForDisplay?.pol || originPort,
      pod: freightQuoteForDisplay?.pod || destPort,
      sellerCompany: sellerCompanyName,
      sellerAddress,
      gst: sellerGst,
      iec: sellerIec,
      contactDetails: sellerContact,
      buyerName,
      buyerAddress,
      buyerCountry,
      buyerContactPerson,
    };

    let existingStuffing = null;
    try {
      existingStuffing = await this.stuffingModel.findOne({
        where: { shipmentId: primaryShipment.id },
      });
    } catch (err) {
      console.warn('Could not query existing stuffing:', err);
    }

    const existingStuffingData = await this.hydrateExistingStuffingRecord(
      existingStuffing,
    );
    const savedBatchMeta =
      existingStuffingData?.autoPopulatedData?.multiShipmentExecution;
    if (
      existingStuffingData &&
      savedBatchMeta?.combinedActualLoadingWeight != null
    ) {
      existingStuffingData.actualLoadingWeight =
        savedBatchMeta.combinedActualLoadingWeight;
      existingStuffingData.grossWeight =
        savedBatchMeta.combinedGrossWeight ?? existingStuffingData.grossWeight;
      existingStuffingData.netWeight =
        savedBatchMeta.combinedNetWeight ?? existingStuffingData.netWeight;
    }

    let readyForShipment = false;
    let isManualOverride = false;
    try {
      const readinessMap =
        await this.readinessService.evaluateBatch(orderedShipments);
      readyForShipment = orderedShipments.every(
        (s) => readinessMap.get(s.id)?.readyForShipment === true,
      );
      isManualOverride = orderedShipments.some(
        (s) => readinessMap.get(s.id)?.isManualOverride === true,
      );
    } catch (err) {
      console.warn('Multi readiness evaluate warning:', err);
    }

    return {
      shipmentId: primaryShipment.id,
      shipmentIds: multiIds,
      isMultiShipment: true,
      multiShipmentMode: modeCategory,
      selectedShipments: selectedShipmentsSummary,
      perShipmentFreights,
      shipmentStatus: primaryShipment.status,
      readyForShipment,
      isManualOverride,
      autoPopulated,
      existingStuffing: existingStuffingData,
    };
  }

  private async saveMultiStuffingExecution(
    primaryShipmentId: number,
    multiIds: number[],
    dto: any,
    user?: any,
    userPermissions?: Set<string>,
  ) {
    const accessByShipmentId = new Map<number, any>();
    for (const sId of multiIds) {
      const access = await this.assertCanModifyStuffing(
        sId,
        user,
        userPermissions,
      );
      accessByShipmentId.set(sId, access);
    }

    const userId = user?.userId ?? user?.id ?? null;
    const isComplete = dto.action === 'complete';
    const isExecutionTransition = this.validateExecutionTransitionDto(dto);
    const now = new Date();

    const loadedQty = Number(dto.actualLoadingWeight ? Number(dto.actualLoadingWeight) : 0);
    if (!Number.isFinite(loadedQty) || loadedQty < 0) {
      throw new BadRequestException('Loaded quantity cannot be negative.');
    }
    if (isComplete && loadedQty <= 0) {
      throw new BadRequestException(
        'Enter a positive loaded quantity before completing stuffing.',
      );
    }

    const normalizedDowntimes = this.normalizeDowntimeRecords(dto.downtimes);
    const sanitizedContainers = this.stripRemovedContainerFields(
      Array.isArray(dto.containers) ? dto.containers : [],
    );
    const cleanedTrucks = Array.isArray(dto.trucks) ? dto.trucks : [];
    const cleanedAttachments = Array.isArray(dto.attachments)
      ? dto.attachments
      : [];

    const { orderedShipments, savedRecords, salesContractId } =
      await this.sequelize.transaction(async (transaction) => {
        const sortedIds = [...multiIds].sort((a, b) => a - b);
        const lockedShipments = await this.shipmentModel.findAll({
          where: { id: { [Op.in]: sortedIds } },
          order: [['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        const byId = new Map<number, SalesContractShipment>(
          lockedShipments.map((s) => [Number(s.id), s]),
        );
        const ordered = multiIds
          .map((id) => byId.get(id))
          .filter((s): s is SalesContractShipment => Boolean(s));

        if (ordered.length !== multiIds.length) {
          const missingId = multiIds.find((id) => !byId.has(id));
          throw new NotFoundException(
            `Shipment #${missingId ?? primaryShipmentId} not found`,
          );
        }

        const contractIds = new Set(
          ordered.map((s) => Number(s.salesContractId || 0)),
        );
        if (contractIds.has(0) || contractIds.size !== 1) {
          this.logMultiExecutionContractMismatch(
            'saveMultiStuffingExecution',
            ordered,
            contractIds,
          );
          throw new BadRequestException(
            'Multi-shipment execution is allowed only for shipments belonging to the same Sales Contract.',
          );
        }

        const contractId = Number(ordered[0].salesContractId);
        const salesContract = await this.contractModel.findByPk(contractId, {
          attributes: ['id', 'originTransportMode', 'transportMode', 'companyId'],
          transaction,
        });

        if (
          user?.companyId &&
          salesContract?.companyId &&
          salesContract.companyId !== user.companyId
        ) {
          throw new NotFoundException(`Shipment #${primaryShipmentId} not found`);
        }

        const modeCategory = getMultiExecutionTransportCategory(salesContract);
        if (!modeCategory) {
          throw new BadRequestException(
            'Multi-shipment execution is supported only for Truck and Rail Freight / Wagon shipments.',
          );
        }

        if (isExecutionTransition) {
          for (const s of ordered) {
            if (s.cargoReadyConfirmed !== true) {
              throw new BadRequestException(
                'Cargo Allocation must be marked Yes before completing shipment stuffing.',
              );
            }
          }
        }

        const totalContractedQty = ordered.reduce(
          (sum, s) => sum + Number(s.quantity || 0),
          0,
        );
        if (loadedQty > totalContractedQty) {
          throw new BadRequestException(
            `Loaded quantity (${loadedQty} MT) exceeds combined selected shipment quantity (${totalContractedQty} MT).`,
          );
        }

        const totalGross = dto.grossWeight ? Number(dto.grossWeight) : 0;
        const totalNet = dto.netWeight ? Number(dto.netWeight) : 0;
        const allocations = distributeMultiShipmentWeights(
          loadedQty,
          totalGross,
          totalNet,
          ordered,
        );
        const allocationById = new Map(
          allocations.map((a) => [a.shipmentId, a]),
        );

        const multiMeta = {
          isMultiShipment: true,
          shipmentIds: multiIds,
          primaryShipmentId,
          transportCategory: modeCategory,
          combinedActualLoadingWeight: loadedQty,
          combinedGrossWeight: totalGross,
          combinedNetWeight: totalNet,
          shipmentBreakdown: allocations,
        };

        const effectiveExecutionStatus = isComplete
          ? 'Loading Completed'
          : dto.executionStatus || 'Pending';

        // Keep Truck freight completely independent (never copy freight overrides across Truck shipments)
        const isolatedFreightOverrides =
          modeCategory === 'truck'
            ? {
                shipmentMode:
                  dto.freightOverrides?.shipmentMode || 'Truck',
              }
            : dto.freightOverrides || null;

        const saved: any[] = [];
        for (const s of ordered) {
          const alloc = allocationById.get(Number(s.id))!;
          const access = accessByShipmentId.get(Number(s.id));

          const perShipmentData: any = {
            companyId: s.companyId || user?.companyId || null,
            shipmentId: s.id,
            salesContractId: s.salesContractId,
            stuffingStatus: isComplete
              ? 'Completed'
              : dto.stuffingStatus || 'Draft',
            executionStatus: effectiveExecutionStatus,
            warehouseStatus: isComplete
              ? 'Completed'
              : dto.warehouseStatus || 'Pending',
            loadingStatus: isComplete
              ? 'Loading Completed'
              : dto.loadingStatus || 'Pending',
            autoPopulatedData: {
              ...(dto.autoPopulated || {}),
              multiShipmentExecution: multiMeta,
            },
            stuffingDate: dto.stuffingDate || null,
            stuffingStartTime: dto.stuffingStartTime || null,
            stuffingEndTime: dto.stuffingEndTime || null,
            stuffingLocation: dto.stuffingLocation || null,
            supervisor: dto.supervisor || null,
            operator: dto.operator || null,
            loadingDate: dto.loadingDate || null,
            loadingStartTime: dto.loadingStartTime || null,
            loadingEndTime: dto.loadingEndTime || null,
            actualLoadingWeight: alloc.actualLoadingWeight,
            grossWeight: alloc.grossWeight,
            netWeight: alloc.netWeight,
            freightOverrides: isolatedFreightOverrides,
            containers: sanitizedContainers,
            downtimes: normalizedDowntimes,
            trucks: cleanedTrucks,
            attachments: cleanedAttachments,
            remarks: dto.remarks || null,
            updatedBy: userId,
            ...(isComplete ? { completedAt: now } : {}),
          };

          const [record] = await this.stuffingModel.findOrCreate({
            where: { shipmentId: s.id },
            defaults: { ...perShipmentData, createdBy: userId },
            transaction,
          });

          if (access?.isOneTimeEdit) {
            perShipmentData.oneTimeCompletedEditUsed = true;
            perShipmentData.oneTimeCompletedEditBy = userId;
            perShipmentData.oneTimeCompletedEditAt = now;
          }

          await record.update(perShipmentData, { transaction });
          saved.push(record);

          if (
            effectiveExecutionStatus === 'Dispatched' ||
            dto.action === 'dispatch'
          ) {
            s.status = 'Dispatched';
            s.executionStatus = 'Dispatched';
            s.manualReadyOverride = true;
            s.manualReadyReason = 'Dispatched';
            s.manualReadyAt = now;
            s.manualReadyBy = userId;
          } else if (effectiveExecutionStatus === 'Completed') {
            s.status = 'Completed';
            s.executionStatus = 'Completed';
            s.manualReadyOverride = true;
            s.manualReadyReason = 'Completed';
            s.manualReadyAt = now;
            s.manualReadyBy = userId;
          } else if (isComplete) {
            s.status = 'Executed';
            s.executionStatus = 'Loading Completed';
            s.manualReadyOverride = true;
            s.manualReadyReason = 'Stuffing Completed';
            s.manualReadyAt = now;
            s.manualReadyBy = userId;
          } else {
            s.executionStatus = effectiveExecutionStatus;
          }
          await s.save({ transaction });
        }

        return {
          orderedShipments: ordered,
          savedRecords: saved,
          salesContractId: contractId,
        };
      });

    if (isComplete) {
      if (salesContractId) {
        await Promise.resolve(
          this.purchaseContractService?.ensureExists?.(salesContractId, userId),
        ).catch((err) => {
          console.warn(
            '[ShipmentService] ensureExists non-fatal warning:',
            err?.message,
          );
        });
      }

      for (let i = 0; i < orderedShipments.length; i++) {
        const s = orderedShipments[i];
        const rec = savedRecords[i];
        await this.auditService.writeLog({
          clientId: user?.clientId ?? null,
          companyId: user?.companyId ?? null,
          userId,
          entityType: 'SalesContractShipment',
          entityId: s.id,
          action: 'STUFFING_EXECUTION_COMPLETED',
          oldValue: null,
          newValue: {
            stuffingId: rec?.id,
            stuffingStatus: 'Completed',
            executionStatus: 'Stuffed',
            multiShipmentIds: multiIds,
            actualLoadingWeight: rec?.actualLoadingWeight ?? loadedQty,
            trucksCount: cleanedTrucks.length,
            completedAt: now,
          },
        });
      }
    }

    const primaryShipment = orderedShipments[0];
    return {
      success: true,
      isMultiShipment: true,
      shipmentIds: multiIds,
      message: isComplete
        ? `Stuffing completed successfully for ${orderedShipments.length} shipments`
        : `Stuffing draft saved successfully for ${orderedShipments.length} shipments`,
      record: savedRecords[0],
      records: savedRecords,
      shipmentStatus: primaryShipment?.status,
      shipmentStatuses: orderedShipments.map((s) => ({
        id: s.id,
        status: s.status,
      })),
      readyForShipment: true,
    };
  }

  private logMultiExecutionContractMismatch(
    operation: string,
    shipments: SalesContractShipment[],
    comparedContractIds: Set<number>,
  ): void {
    console.warn(`[MultiStuffingExecution:${operation}] Sales Contract validation failed:`, {
      comparedContractIds: Array.from(comparedContractIds),
      shipments: shipments.map((s) => ({
        shipmentId: s.id,
        shipmentReference: s.shipmentReference ?? null,
        salesContractId: s.salesContractId ?? null,
        salesContractObjId: s.salesContract?.id ?? null,
        comparedSalesContractId: Number(s.salesContractId || 0),
        salesContractNo: s.salesContract?.contractNumber ?? null,
        businessTransactionId: s.businessTransactionId ?? null,
      })),
    });
  }
}
