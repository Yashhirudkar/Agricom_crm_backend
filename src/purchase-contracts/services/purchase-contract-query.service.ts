import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PurchaseContract } from '../models/purchase-contract.model';
import { PurchaseContractItem } from '../models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { PurchaseContractAttachment } from '../models/purchase-contract-attachment.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { Product } from '../../masters/product/product.model';
import { BagType } from '../../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../../masters/bag-specs/models/bag-specification.model';
import { TradeDocument } from '../../masters/trade-document/trade-document.model';
import { Attachment } from '../../attachments/models/attachment.model';
import { QueryPurchaseContractDto } from '../dto/query-purchase-contract.dto';
import { calculatePurchaseAllocation, AllocationSummaryResult } from '../utils/purchase-allocation.util';

@Injectable()
export class PurchaseContractQueryService {
  constructor(
    @InjectModel(PurchaseContract)
    private readonly model: typeof PurchaseContract,
    @InjectModel(PurchaseContractShipment)
    private readonly shipmentLinkModel: typeof PurchaseContractShipment,
    @InjectModel(PurchaseContractRequiredDocument)
    private readonly docModel: typeof PurchaseContractRequiredDocument,
    @InjectModel(PurchaseContractAttachment)
    private readonly attachmentLinkModel: typeof PurchaseContractAttachment,
    @InjectModel(SalesContractShipment)
    private readonly salesShipmentModel: typeof SalesContractShipment,
    private readonly sequelize: Sequelize,
  ) {}

  // ─── LIST ─────────────────────────────────────────────────────────────────────
  async findAll(query: QueryPurchaseContractDto) {
    const {
      search,
      status,
      buyerId,
      financialYear,
      salesContractId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const offset = (Number(page) - 1) * Number(limit);
    const whereClause: any = {};
    const salesContractWhere: any = {};

    if (status) whereClause.status = status;
    if (salesContractId) whereClause.salesContractId = salesContractId;
    if (buyerId) salesContractWhere.buyerId = buyerId;
    if (financialYear) salesContractWhere.financialYear = financialYear;
    if (search) {
      salesContractWhere.contractNumber = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      include: [
        { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
        { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          attributes: ['id', 'contractNumber', 'financialYear', 'buyerId', 'currencyCode'],
          include: [
            { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
          ],
        },
      ],
      distinct: true,
      limit: Number(limit),
      offset,
      order: [[sortBy, sortOrder]],
    });

    // Attach derived contract number and shipment count
    const data = await Promise.all(
      rows.map(async (pc) => {
        const json: any = pc.toJSON();
        json.contractNumber = pc.contractNumber || (pc.salesContract ? `PC-${pc.salesContract.contractNumber}` : `PC-${pc.id}`);
        json.shipmentCount = await this.shipmentLinkModel.count({ where: { purchaseContractId: pc.id } });
        return json;
      }),
    );

    return {
      data,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(count / Number(limit))),
    };
  }

  // ─── DETAIL ───────────────────────────────────────────────────────────────────
  async findOneWithDetail(id: number) {
    const pc = await this.model.findByPk(id, {
      include: [
        { model: Partner, as: 'buyer' },
        { model: Partner, as: 'seller' },
        { model: Partner, as: 'broker' },
        { model: PaymentTerm, as: 'paymentTerm' },
        {
          model: PurchaseContractItem,
          as: 'items',
          include: [
            { model: Product, as: 'product', attributes: ['id', 'name'] },
          ],
        },
        {
          model: SalesContract,
          as: 'salesContract',
          required: false,
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
            { model: Partner, as: 'broker' },
            { model: ShipmentType, as: 'shipmentType' },
            { model: PaymentTerm, as: 'paymentTerm' },
            { model: SalesContractShipment, as: 'shipments' },
            {
              model: SalesContractItem,
              as: 'items',
              include: [
                { model: Product, as: 'product', attributes: ['id', 'name'] },
                { model: BagType, as: 'bagType' },
                { model: PackingType, as: 'packingType' },
                { model: BagSpecification, as: 'bagSpecification' },
              ],
            },
          ],
        },
        {
          model: PurchaseContractRequiredDocument,
          as: 'requiredDocuments',
          include: [
            { model: TradeDocument, as: 'tradeDocument', attributes: ['id', 'name', 'mandatoryByDefault'] },
            { model: Attachment, as: 'attachment', attributes: ['id', 'originalName', 'mimeType', 'fileSize'], required: false },
          ],
        },
      ],
    });

    if (!pc) throw new NotFoundException('Purchase Contract not found');

    const json: any = pc.toJSON();
    json.contractNumber = pc.contractNumber || (pc.salesContract ? `PC-${pc.salesContract.contractNumber}` : `PC-${pc.id}`);
    if (!json.terms || json.terms.length === 0) {
      json.terms = pc.salesContract?.terms || [];
    }
    json.health = await this.computeHealthScore(id);
    json.allocationSummary = await this.computeAllocationSummary(id);

    const attachmentLinks = await this.attachmentLinkModel.findAll({
      where: { purchaseContractId: id },
      include: [
        {
          model: Attachment,
          as: 'attachment',
          attributes: ['id', 'originalName', 'mimeType', 'fileSize'],
        },
      ],
      order: [['createdAt', 'DESC']],
    }).catch(() => []);

    json.attachments = attachmentLinks.map((l) => ({
      id: l.id,
      attachmentId: l.attachmentId,
      category: l.category,
      originalName: l.attachment?.originalName || 'Attachment',
      mimeType: l.attachment?.mimeType,
      fileSize: l.attachment?.fileSize,
      downloadUrl: l.attachment ? `/attachments/${l.attachment.id}/download` : null,
      createdAt: l.createdAt,
    }));

    return json;
  }

  // ─── SUMMARY (aggregation via single SQL) ─────────────────────────────────────
  async getSummary(id: number) {
    const pc = await this.model.findByPk(id, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          attributes: ['id', 'contractNumber', 'currencyCode', 'financialYear'],
          include: [
            { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
            { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
            { model: Partner, as: 'broker', attributes: ['id', 'entityName'] },
            { model: PaymentTerm, as: 'paymentTerm', attributes: ['id', 'name'] },
            {
              model: SalesContractItem,
              as: 'items',
              include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
            },
          ],
        },
      ],
    });
    if (!pc) throw new NotFoundException('Purchase Contract not found');

    // Single aggregation query — no N+1, no in-memory math
    const [financials]: any[] = await this.sequelize.query(
      `
      SELECT
        COUNT(scs.id)                                           AS shipment_count,
        COALESCE(SUM(scs.quantity), 0)                         AS total_quantity,
        COALESCE(AVG(scs.purchase_rate) FILTER (WHERE scs.purchase_rate IS NOT NULL), 0) AS avg_purchase_rate,
        COALESCE(SUM(scs.freight) FILTER (WHERE scs.freight IS NOT NULL), 0)             AS total_freight,
        COALESCE(AVG(scs.freight) FILTER (WHERE scs.freight IS NOT NULL), 0)             AS avg_freight,
        COALESCE(SUM(scs.forex) FILTER (WHERE scs.forex IS NOT NULL), 0)                AS total_forex,
        COALESCE(AVG(scs.forex) FILTER (WHERE scs.forex IS NOT NULL), 0)                AS avg_forex,
        COALESCE(SUM(scs.quantity * scs.purchase_rate) FILTER (WHERE scs.purchase_rate IS NOT NULL), 0) AS contract_value,
        COALESCE(SUM(scs.no_of_containers), 0)                 AS container_count
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      WHERE pcs.purchase_contract_id = :id
        AND scs.status != 'Cancelled'
      `,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    // Document summary
    const docs = await this.docModel.findAll({ where: { purchaseContractId: id } });
    const totalDocs = docs.length;
    const uploadedDocs = docs.filter((d) => !!d.attachmentId).length;

    // Timeline summary
    const timeline = await this.getTimelineSummary(id);

    // Health score
    const health = await this.computeHealthScore(id);

    // Allocation summary
    const allocationSummary = await this.computeAllocationSummary(id);

    return {
      contractInfo: {
        id: pc.id,
        contractNumber: `PC-${pc.salesContract?.contractNumber}`,
        status: pc.status,
        financialYear: pc.salesContract?.financialYear,
        currency: pc.salesContract?.currencyCode,
      },
      commercialInfo: {
        buyer: pc.salesContract?.buyer,
        seller: pc.salesContract?.seller,
        broker: pc.salesContract?.broker,
        paymentTerm: pc.salesContract?.paymentTerm,
      },
      productSummary: pc.salesContract?.items?.map((item: any) => ({
        product: item.product,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })) ?? [],
      financialSummary: {
        shipmentCount: Number(financials.shipment_count),
        containerCount: Number(financials.container_count),
        totalQuantity: parseFloat(financials.total_quantity),
        avgPurchaseRate: parseFloat(parseFloat(financials.avg_purchase_rate).toFixed(4)),
        totalFreight: parseFloat(financials.total_freight),
        avgFreight: parseFloat(parseFloat(financials.avg_freight).toFixed(4)),
        totalForex: parseFloat(financials.total_forex),
        avgForex: parseFloat(parseFloat(financials.avg_forex).toFixed(4)),
        contractValue: parseFloat(parseFloat(financials.contract_value).toFixed(2)),
      },
      documentSummary: {
        total: totalDocs,
        uploaded: uploadedDocs,
        pending: totalDocs - uploadedDocs,
        completionPct: totalDocs > 0 ? Math.round((uploadedDocs / totalDocs) * 100) : 100,
      },
      timelineSummary: timeline,
      health,
      allocationSummary,
    };
  }

  // ─── ALLOCATION SUMMARY ───────────────────────────────────────────────────────
  async computeAllocationSummary(purchaseContractId: number): Promise<AllocationSummaryResult> {
    const pc = await this.model.findByPk(purchaseContractId, {
      attributes: ['id', 'salesContractId'],
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          attributes: ['id'],
          include: [
            {
              model: SalesContractItem,
              as: 'items',
              attributes: ['quantity'],
            },
          ],
        },
      ],
    });
    if (!pc) throw new NotFoundException('Purchase Contract not found');

    const salesContractQty = pc.salesContract?.items?.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0,
    ) || 0;

    // Sum of shipment quantities in OTHER active purchase contracts linked to the same Sales Contract
    const [alreadyAllocatedRes]: any[] = await this.sequelize.query(
      `
      SELECT COALESCE(SUM(scs.quantity), 0) AS already_allocated
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
      WHERE pc.sales_contract_id = :salesContractId
        AND pc.id != :purchaseContractId
        AND pc.status NOT IN ('Cancelled', 'Rejected')
        AND scs.status != 'Cancelled'
      `,
      {
        replacements: {
          salesContractId: pc.salesContractId,
          purchaseContractId,
        },
        type: QueryTypes.SELECT,
      },
    );

    const alreadyAllocatedQty = parseFloat(alreadyAllocatedRes?.already_allocated || 0);

    // Sum of selected shipment quantities in THIS purchase contract
    const [currentPurchaseRes]: any[] = await this.sequelize.query(
      `
      SELECT COALESCE(SUM(scs.quantity), 0) AS current_purchase
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      WHERE pcs.purchase_contract_id = :purchaseContractId
        AND scs.status != 'Cancelled'
      `,
      {
        replacements: { purchaseContractId },
        type: QueryTypes.SELECT,
      },
    );

    const currentPurchaseQty = parseFloat(currentPurchaseRes?.current_purchase || 0);

    return calculatePurchaseAllocation({
      salesContractQty,
      alreadyAllocatedQty,
      currentPurchaseQty,
    });
  }

  // ─── TIMELINE ─────────────────────────────────────────────────────────────────
  async getTimeline(id: number) {
    const pc = await this.model.findByPk(id);
    if (!pc) throw new NotFoundException('Purchase Contract not found');

    const links = await this.shipmentLinkModel.findAll({
      where: { purchaseContractId: id },
      include: [
        {
          model: SalesContractShipment,
          as: 'shipment',
          include: [
            {
              model: SalesContract,
              as: 'salesContract',
              attributes: ['contractNumber'],
            },
          ],
        },
      ],
      order: [[{ model: SalesContractShipment, as: 'shipment' }, 'shipmentDate', 'ASC']],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return links.map((link) => {
      const s = link.shipment;
      const target = new Date(s.shipmentDate);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
      const isOverdue = diffDays < 0 && !['Delivered', 'Cancelled'].includes(s.status);

      return {
        shipmentId: s.id,
        shipmentNo: s.shipmentNo,
        shipmentReference: s.shipmentReference,
        shipmentDate: s.shipmentDate,
        quantity: s.quantity,
        noOfContainers: s.noOfContainers,
        status: s.status,
        daysRemaining: diffDays,
        isOverdue,
        isCompleted: s.status === 'Delivered',
        contractNumber: s.salesContract?.contractNumber,
        milestones: this.buildMilestones(s),
      };
    });
  }

  private buildMilestones(s: SalesContractShipment) {
    const statuses = ['Scheduled', 'In Transit', 'At Port', 'Customs Clearance', 'Delivered'];
    const currentIndex = statuses.indexOf(s.status);
    return statuses.map((st, i) => ({
      label: st,
      status: i < currentIndex ? 'completed' : i === currentIndex ? 'active' : 'pending',
    }));
  }

  private async getTimelineSummary(id: number) {
    const todayStr = new Date().toISOString().split('T')[0];

    const [summary]: any[] = await this.sequelize.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE scs.shipment_date::text > :today AND scs.status != 'Delivered' AND scs.status != 'Cancelled') AS upcoming,
        COUNT(*) FILTER (WHERE scs.shipment_date::text < :today AND scs.status NOT IN ('Delivered','Cancelled'))              AS overdue,
        COUNT(*) FILTER (WHERE scs.status = 'Delivered')                                                                     AS completed,
        MIN(scs.shipment_date) FILTER (WHERE scs.shipment_date::text >= :today AND scs.status != 'Delivered')                AS next_shipment_date
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      WHERE pcs.purchase_contract_id = :id
      `,
      { replacements: { id, today: todayStr }, type: QueryTypes.SELECT },
    );

    return {
      upcoming: Number(summary.upcoming),
      overdue: Number(summary.overdue),
      completed: Number(summary.completed),
      nextShipmentDate: summary.next_shipment_date,
    };
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────────
  async getDashboard() {
    const [stats]: any[] = await this.sequelize.query(
      `
      SELECT
        COUNT(*)                                                       AS total_contracts,
        COUNT(*) FILTER (WHERE status = 'In Progress')                AS active,
        COUNT(*) FILTER (WHERE status = 'Awaiting Documents')         AS awaiting_documents,
        COUNT(*) FILTER (WHERE status = 'Ready for Dispatch')         AS ready_for_dispatch,
        COUNT(*) FILTER (WHERE status = 'Completed')                  AS completed,
        COUNT(*) FILTER (WHERE status = 'Closed')                     AS closed,
        COUNT(*) FILTER (WHERE status = 'Cancelled')                  AS cancelled,
        COUNT(*) FILTER (WHERE status = 'Draft')                      AS draft
      FROM purchase_contracts
      `,
      { type: QueryTypes.SELECT },
    );

    // Overdue shipments across all contracts
    const [overdueStats]: any[] = await this.sequelize.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE scs.shipment_date < NOW()::date AND scs.status NOT IN ('Delivered','Cancelled'))  AS overdue_shipments,
        COUNT(*) FILTER (WHERE scs.shipment_date >= NOW()::date AND scs.status != 'Delivered')                   AS upcoming_shipments
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
      WHERE pc.status NOT IN ('Cancelled','Closed')
      `,
      { type: QueryTypes.SELECT },
    );

    // Financial aggregation across all active contracts
    const [financials]: any[] = await this.sequelize.query(
      `
      SELECT
        COALESCE(SUM(scs.quantity), 0)                                       AS total_quantity,
        COALESCE(SUM(scs.quantity * scs.purchase_rate)
          FILTER (WHERE scs.purchase_rate IS NOT NULL), 0)                   AS total_value,
        COUNT(DISTINCT pcs.purchase_contract_id)                             AS contracts_with_shipments
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      JOIN purchase_contracts pc ON pc.id = pcs.purchase_contract_id
      WHERE pc.status NOT IN ('Cancelled','Closed')
        AND scs.status != 'Cancelled'
      `,
      { type: QueryTypes.SELECT },
    );

    // Pending documents
    const [docStats]: any[] = await this.sequelize.query(
      `
      SELECT COUNT(*) AS documents_pending
      FROM purchase_contract_required_documents pcrd
      JOIN purchase_contracts pc ON pc.id = pcrd.purchase_contract_id
      WHERE pcrd.attachment_id IS NULL
        AND pc.status NOT IN ('Cancelled','Closed','Completed')
      `,
      { type: QueryTypes.SELECT },
    );

    return {
      contracts: {
        total: Number(stats.total_contracts),
        draft: Number(stats.draft),
        active: Number(stats.active),
        awaitingDocuments: Number(stats.awaiting_documents),
        readyForDispatch: Number(stats.ready_for_dispatch),
        completed: Number(stats.completed),
        closed: Number(stats.closed),
        cancelled: Number(stats.cancelled),
      },
      shipments: {
        overdue: Number(overdueStats.overdue_shipments),
        upcoming: Number(overdueStats.upcoming_shipments),
      },
      financials: {
        totalQuantity: parseFloat(financials.total_quantity),
        totalValue: parseFloat(parseFloat(financials.total_value).toFixed(2)),
      },
      documentsPending: Number(docStats.documents_pending),
    };
  }

  // ─── CONTRACT HEALTH SCORE ────────────────────────────────────────────────────
  async computeHealthScore(id: number) {
    const todayStr = new Date().toISOString().split('T')[0];

    // Shipment completion
    const [shipmentStats]: any[] = await this.sequelize.query(
      `
      SELECT
        COUNT(*)                                                             AS total,
        COUNT(*) FILTER (WHERE scs.status = 'Delivered')                    AS delivered,
        COUNT(*) FILTER (WHERE scs.shipment_date::text < :today
          AND scs.status NOT IN ('Delivered','Cancelled'))                   AS overdue
      FROM purchase_contract_shipments pcs
      JOIN sales_contract_shipments scs ON scs.id = pcs.shipment_id
      WHERE pcs.purchase_contract_id = :id
      `,
      { replacements: { id, today: todayStr }, type: QueryTypes.SELECT },
    );

    // Document completion
    const docs = await this.docModel.findAll({ where: { purchaseContractId: id } });
    const totalDocs = docs.length;
    const uploadedDocs = docs.filter((d) => !!d.attachmentId).length;

    const total = Number(shipmentStats.total);
    const delivered = Number(shipmentStats.delivered);
    const overdue = Number(shipmentStats.overdue);

    const shipmentCompletion = total > 0 ? Math.round((delivered / total) * 100) : 100;
    const documentCompletion = totalDocs > 0 ? Math.round((uploadedDocs / totalDocs) * 100) : 100;
    const overdueCount = overdue;

    // Score formula: 50% shipment + 30% documents + 20% no overdue
    const overdueScore = overdue === 0 ? 100 : Math.max(0, 100 - overdue * 20);
    const healthScore = Math.round(
      shipmentCompletion * 0.5 + documentCompletion * 0.3 + overdueScore * 0.2,
    );

    let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    if (healthScore >= 80) riskLevel = 'Low';
    else if (healthScore >= 60) riskLevel = 'Medium';
    else if (healthScore >= 40) riskLevel = 'High';
    else riskLevel = 'Critical';

    return {
      healthScore,
      riskLevel,
      shipmentCompletion,
      documentCompletion,
      overdueCount,
      upcomingCount: total - delivered - overdue,
    };
  }
}
