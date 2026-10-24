import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
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
import { ShipmentStuffing } from './models/shipment-stuffing.model';
import { CargoShipmentAllocation } from '../cargo-availability/models/cargo-shipment-allocation.model';
import { Logistics } from '../logistics/models/logistics.model';
import { FreightQuote } from '../logistics/models/freight-quote.model';
import { Company } from '../companies/models/company.model';
import { Enquiry } from '../enquiries/models/enquiry.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';

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
    private readonly readinessService: ShipmentReadinessService,
    private readonly auditService: AuditService,
    @InjectModel(ShipmentStuffing)
    private readonly stuffingModel: typeof ShipmentStuffing,
    @InjectModel(CargoShipmentAllocation)
    private readonly cargoAllocationModel: typeof CargoShipmentAllocation,
    @InjectModel(Logistics)
    private readonly logisticsModel: typeof Logistics,
    @InjectModel(FreightQuote)
    private readonly freightQuoteModel: typeof FreightQuote,
  ) {}

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

  private async buildQueryOptions(query: any) {
    const {
      search,
      status,
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

    // 3. Workflow Status
    if (status) {
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
    ];

    return { whereClause, includes };
  }

  async findAll(query: any) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'shipmentDate',
      sortOrder = 'ASC',
    } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const { whereClause, includes } = await this.buildQueryOptions(query);

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

    const { rows, count } = await this.shipmentModel.findAndCountAll({
      where: whereClause,
      include: includes,
      distinct: true,
      subQuery: false,
      limit: Number(limit),
      offset: Number(offset),
      order,
    });

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

    // Batch check executed status against purchase_contract_shipments
    const currentShipmentIds = rows.map((r) => r.id);
    const executedShipmentIdSet = new Set<number>();
    if (currentShipmentIds.length > 0) {
      try {
        const [linkedRows]: any =
          (await this.shipmentModel.sequelize?.query(
            `SELECT DISTINCT shipment_id FROM purchase_contract_shipments WHERE shipment_id IN (:ids)`,
            { replacements: { ids: currentShipmentIds } },
          )) || [[]];
        if (Array.isArray(linkedRows)) {
          linkedRows.forEach((lr: any) =>
            executedShipmentIdSet.add(Number(lr.shipment_id)),
          );
        }
      } catch (e) {
        // non-blocking
      }
    }

    const data = rows.map((shipment) => {
      const json: any = shipment.toJSON ? shipment.toJSON() : { ...shipment };
      const isExecuted =
        json.status === 'Executed' || executedShipmentIdSet.has(json.id);
      if (isExecuted) {
        json.status = 'Executed';
        json.isExecuted = true;
      } else {
        json.isExecuted = false;
      }

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

      return json;
    });

    return {
      data,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(count / Number(limit))),
    };
  }

  async getStats(query: any) {
    const { whereClause, includes } = await this.buildQueryOptions(query);
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
      include: [{ model: SalesContract, as: 'salesContract' }],
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
    if (dto.freight !== undefined) shipment.freight = dto.freight;
    if (dto.remarks !== undefined) shipment.remarks = dto.remarks;
    if (dto.shipmentNo !== undefined) shipment.shipmentNo = dto.shipmentNo;
    if (dto.status !== undefined) shipment.status = dto.status;

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

    await shipment.save();

    // ── AUTO-CREATE PURCHASE CONTRACT (idempotent) ────────────────────────────
    // Ensures a Purchase Contract exists for this Sales Contract after any shipment save.
    // Safe to call multiple times — returns existing PC if already created.
    await this.purchaseContractService
      .ensureExists(shipment.salesContractId, user?.userId)
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
    json.businessReference = json.businessTransaction?.businessReference ?? null;
    json.cargoReady = readiness.cargoReady;
    json.freightReady = readiness.freightReady;
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
    json.businessReference = json.businessTransaction?.businessReference ?? null;
    json.timeline = this.calculateTimeline(json.shipmentDate, json.status);
    json.cargoReady = readiness.cargoReady;
    json.freightReady = readiness.freightReady;
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

  /**
   * Auto-populates 80-90% read-only data for Shipment Stuffing Execution
   * Fetches data from Shipment, Sales Contract, Items, Cargo Allocation, Freight, Company, and Buyer.
   */
  async getStuffingExecutionData(shipmentId: number, user?: any) {
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
                { model: BagSpecification, as: 'bagSpecification', required: false },
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
    try {
      const pcShipmentModel = this.shipmentModel.sequelize?.models['PurchaseContractShipment'];
      const pcModel = this.shipmentModel.sequelize?.models['PurchaseContract'];
      if (pcShipmentModel && pcModel) {
        const pcLink: any = await pcShipmentModel.findOne({
          where: { shipmentId: shipment.id },
        });
        if (pcLink?.purchaseContractId) {
          const pc: any = await pcModel.findByPk(pcLink.purchaseContractId);
          if (pc?.contractNumber) purchaseContractNo = pc.contractNumber;
        } else if (shipment.salesContractId) {
          const directPc: any = await pcModel.findOne({
            where: { salesContractId: shipment.salesContractId },
          });
          if (directPc?.contractNumber) {
            purchaseContractNo = directPc.contractNumber;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch linked Purchase Contract:', err);
    }

    // 2. Cargo Allocation
    let cargoAllocations: any[] = [];
    try {
      const caModel = this.shipmentModel.sequelize?.models['CargoAvailability'];
      cargoAllocations = await this.cargoAllocationModel.findAll({
        where: { shipmentId: shipment.id, status: 'Active' },
        include: caModel ? [{ model: caModel as any, as: 'cargoAvailability', required: false }] : [],
      });
    } catch (err) {
      console.warn('Could not fetch cargo allocations for stuffing:', err);
    }

    const cargoLots = cargoAllocations
      .map(
        (a: any) =>
          a.cargoAvailability?.lotNumber ||
          a.cargoAvailability?.batchNumber,
      )
      .filter(Boolean);
    const allocatedCargoLotsStr =
      cargoLots.length > 0
        ? Array.from(new Set(cargoLots)).join(', ')
        : `LOT-${shipment.id}`;

    const warehouseName =
      cargoAllocations[0]?.cargoAvailability?.loadingLocation ||
      'Main Cargo Warehouse';

    const availableWeight = Number(
      cargoAllocations[0]?.cargoAvailability?.availableQuantity ||
        cargoAllocations[0]?.cargoAvailability?.receivedQuantity ||
        shipment.quantity ||
        0,
    );

    const allocatedWeight =
      cargoAllocations.reduce(
        (sum, a: any) => sum + Number(a.allocatedQty || 0),
        0,
      ) || Number(shipment.quantity || 0);

    const balanceWeight = Math.max(
      0,
      parseFloat((availableWeight - allocatedWeight).toFixed(2)),
    );

    // 3. Freight Info
    let freightQuote: any = null;
    try {
      if (shipment.logisticsId) {
        freightQuote = await this.freightQuoteModel.findOne({
          where: { logisticsId: shipment.logisticsId },
          order: [['id', 'DESC']],
        });
      }
    } catch (err) {
      console.warn('Could not fetch freight quote for stuffing:', err);
    }

    // 4. Extract Shipment & Contract Data
    const contract = shipment.salesContract || ({} as any);
    const item = contract.items?.[0] || {};
    const product = item.product || {};
    const buyer = contract.buyer || {};
    const seller = contract.seller || {};
    const company = shipment.company || contract.company || {};

    const bagSizeKg = Number(item.bagSpecification?.size || 50) || 50;
    const quantityMt = Number(shipment.quantity || 0);
    const totalBags = Math.round((quantityMt * 1000) / bagSizeKg) || 0;

    const originPort =
      contract.portOfLoading ||
      contract.originLocationName ||
      freightQuote?.pol ||
      'Nhava Sheva Port';
    const destPort =
      contract.portOfDischarge ||
      contract.destinationLocationName ||
      freightQuote?.pod ||
      'Jebel Ali Port';
    const originCountry = contract.originCountry || 'India';
    const destCountry = contract.destinationCountry || 'UAE';
    const route = `${originPort} ➔ ${destPort}`;

    // Company Details
    const sellerCompanyName =
      company.legalName ||
      company.name ||
      seller.entityName ||
      'Agricom Global Private Limited';
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
      'Export Zone, Mumbai, Maharashtra, India';
    const sellerGst =
      company.taxNumber || seller.taxId || '27AAACG1234F1Z5';
    const sellerIec =
      company.registrationNumber || seller.panNo || '0398012345';
    const sellerContact =
      [company.phone, company.email].filter(Boolean).join(' | ') ||
      seller.contactEmail ||
      '+91 22 2654 3210 | logistics@agricom.com';

    // Buyer Details
    const buyerName = buyer.entityName || 'Global Importers LLC';
    const buyerAddress = buyer.address
      ? `${buyer.address}, ${buyer.city || ''}, ${buyer.country || ''}`
      : buyer.loadingAddress || 'Industrial Area 4, Sharjah, UAE';
    const buyerCountry = buyer.country || destCountry;
    const buyerContactPerson = buyer.contacts?.[0]
      ? `${buyer.contacts[0].contactName || ''} (${buyer.contacts[0].contactNumber || buyer.contacts[0].email || ''})`
      : buyer.contactEmail || 'Ahmed Al Mansoori (+971 50 123 4567)';

    // Build the complete auto-populated object (80-90% read only data)
    const autoPopulated = {
      // From Shipment
      shipmentRef: shipment.shipmentReference || `SHP-${shipment.id}`,
      businessRefNo:
        shipment.businessTransaction?.businessReference ||
        `BTX-2026-${shipment.id}`,
      salesContractNo:
        contract.contractNumber || `SC-2026-${shipment.salesContractId}`,
      purchaseContractNo: purchaseContractNo,
      enquiryRef:
        contract.enquiry?.enquiryReference ||
        (contract.enquiryId
          ? `ENQ-${String(contract.enquiryId).slice(0, 8)}`
          : 'ENQ-DIRECT'),
      buyer: buyerName,
      seller: sellerCompanyName,
      product: product.name || 'Organic Soybean',
      commodityGrade:
        product.grade ||
        product.commodityGrade ||
        item.remarks ||
        'Standard Export Quality (Grade A)',
      quantityMt: quantityMt,
      packingType: item.packingType?.name || 'PP Woven Bags',
      bagSize: `${bagSizeKg} Kg`,
      totalBags: totalBags,
      incoterm:
        contract.paymentTerm?.name || contract.contractType || 'FOB',
      shipmentDate: shipment.shipmentDate,
      freightType:
        contract.shipmentType?.name ||
        freightQuote?.mode ||
        'Sea Freight (FCL)',
      shipmentType:
        contract.contractType || contract.shipmentType?.name || 'Export',
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
      balanceWeight: balanceWeight,

      // From Freight (defaults, editable if not available)
      shippingLine: freightQuote?.shippingLine || '',
      vessel: freightQuote?.vessel || '',
      voyage: freightQuote?.voyage || '',
      containerType:
        freightQuote?.containerType ||
        freightQuote?.containerSize ||
        (shipment.noOfContainers
          ? `${shipment.noOfContainers}x 20' Standard Container`
          : "20' Heavy Container"),
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

    return {
      shipmentId: shipment.id,
      shipmentStatus: shipment.status,
      readyForShipment,
      isManualOverride,
      autoPopulated,
      existingStuffing: existingStuffing
        ? existingStuffing.get({ plain: true })
        : null,
    };
  }

  /**
   * Saves stuffing execution (Save as Draft OR Complete Stuffing)
   */
  async saveStuffingExecution(shipmentId: number, dto: any, user?: any) {
    const shipment = await this.shipmentModel.findByPk(shipmentId, {
      include: [{ model: SalesContract, as: 'salesContract' }],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    const userId = user?.userId ?? user?.id ?? null;
    const isComplete = dto.action === 'complete';

    let record = await this.stuffingModel.findOne({
      where: { shipmentId },
    });

    const now = new Date();
    const stuffingData: any = {
      companyId: shipment.companyId || user?.companyId || null,
      shipmentId: shipment.id,
      salesContractId: shipment.salesContractId,
      stuffingStatus: isComplete ? 'Completed' : dto.stuffingStatus || 'Draft',
      executionStatus: isComplete ? 'Stuffed' : dto.executionStatus || 'Draft',
      autoPopulatedData: dto.autoPopulated || {},
      stuffingDate: dto.stuffingDate || null,
      stuffingStartTime: dto.stuffingStartTime || null,
      stuffingEndTime: dto.stuffingEndTime || null,
      stuffingLocation: dto.stuffingLocation || null,
      supervisor: dto.supervisor || null,
      loadingDate: dto.loadingDate || null,
      actualLoadingWeight: dto.actualLoadingWeight
        ? Number(dto.actualLoadingWeight)
        : 0,
      grossWeight: dto.grossWeight ? Number(dto.grossWeight) : 0,
      netWeight: dto.netWeight ? Number(dto.netWeight) : 0,
      freightOverrides: dto.freightOverrides || null,
      containers: Array.isArray(dto.containers) ? dto.containers : [],
      trucks: Array.isArray(dto.trucks) ? dto.trucks : [],
      attachments: Array.isArray(dto.attachments) ? dto.attachments : [],
      remarks: dto.remarks || null,
      updatedBy: userId,
    };

    if (isComplete) {
      stuffingData.completedAt = now;
    }

    if (record) {
      await record.update(stuffingData);
    } else {
      stuffingData.createdBy = userId;
      record = await this.stuffingModel.create(stuffingData);
    }

    // On Complete Stuffing:
    // - Stuffing Status = Completed
    // - Shipment Ready = Yes
    // - Execution Status = Stuffed
    if (isComplete) {
      shipment.status = 'Executed';
      shipment.manualReadyOverride = true;
      shipment.manualReadyReason = 'Stuffing Completed';
      shipment.manualReadyAt = now;
      shipment.manualReadyBy = userId;
      await shipment.save();

      // Idempotent Purchase Contract link
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

      // Audit trail
      await this.auditService.writeLog({
        clientId: user?.clientId ?? null,
        companyId: user?.companyId ?? null,
        userId: userId,
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
}
