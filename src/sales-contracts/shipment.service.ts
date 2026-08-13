import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import { SalesContractShipment } from './models/sales-contract-shipment.model';
import { SalesContract } from './models/sales-contract.model';
import { Partner } from '../masters/partner/partner.model';
import { SalesContractItem } from './models/sales-contract-item.model';
import { Product } from '../masters/product/product.model';
import { SalesContractDocument } from './models/sales-contract-document.model';
import { SalesContractDocumentFile } from './models/sales-contract-document-file.model';
import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { generateShipmentReference } from './utils/shipment-reference.util';

@Injectable()
export class ShipmentService {
  constructor(
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(SalesContract)
    private readonly contractModel: typeof SalesContract,
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
      return { label: `In ${daysDiff} Days`, color, days: daysDiff, type: 'upcoming' };
    } else {
      return { label: `Overdue ${Math.abs(daysDiff)} Days`, color: 'red', days: daysDiff, type: 'overdue' };
    }
  }

  private buildQueryOptions(query: any) {
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
    } = query;

    const whereClause: any = {};
    const contractWhereClause: any = {};

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
          Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "SalesContractShipment"."shipment_date"')),
          Number(shipmentMonth),
        ),
      );
    }
    if (shipmentYear) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn('EXTRACT', Sequelize.literal('YEAR FROM "SalesContractShipment"."shipment_date"')),
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
    if (portOfLoading) contractWhereClause.portOfLoading = { [Op.iLike]: `%${portOfLoading}%` };
    if (portOfDischarge) contractWhereClause.portOfDischarge = { [Op.iLike]: `%${portOfDischarge}%` };

    if (country) {
      contractWhereClause[Op.or] = [
        { originCountry: { [Op.iLike]: `%${country}%` } },
        { destinationCountry: { [Op.iLike]: `%${country}%` } },
      ];
    }

    // 6. Search across multiple tables
    if (search) {
      whereClause[Op.or] = [
        { shipmentReference: { [Op.iLike]: `%${search}%` } },
        { '$salesContract.contract_number$': { [Op.iLike]: `%${search}%` } },
        { '$salesContract.buyer.entity_name$': { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Includes
    const includes: any[] = [
      {
        model: SalesContract,
        as: 'salesContract',
        where: contractWhereClause,
        required: true,
        include: [
          { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
          { model: Partner, as: 'seller', attributes: ['id', 'entityName'] },
          {
            model: SalesContractItem,
            as: 'items',
            required: productId ? true : false,
            where: productId ? { productId } : undefined,
            include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
          },
          {
            model: SalesContractDocument,
            as: 'documents',
            include: [{ model: TradeDocument, as: 'tradeDocument', attributes: ['id', 'name', 'mandatoryByDefault'] }],
          },
          {
            model: SalesContractDocumentFile,
            as: 'documentFiles',
            attributes: ['id', 'tradeDocumentId', 'attachmentId'],
          },
        ],
      },
    ];

    return { whereClause, includes };
  }

  async findAll(query: any) {
    const { page = 1, limit = 10, sortBy = 'shipmentDate', sortOrder = 'ASC' } = query;
    const offset = (Number(page) - 1) * Number(limit);

    const { whereClause, includes } = this.buildQueryOptions(query);

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

    const data = rows.map((shipment) => {
      const json = (shipment.toJSON ? shipment.toJSON() : { ...shipment }) as any;
      // Dynamic timeline object injection
      json.timeline = this.calculateTimeline(json.shipmentDate, json.status);

      // Extract products list for grid ease
      json.products = json.salesContract?.items?.map((item: any) => ({
        id: item.product?.id,
        name: item.product?.name,
      })) || [];

      // Calculate document progress
      const mandatoryDocs = json.salesContract?.documents?.filter((doc: any) => doc.isMandatory) || [];
      const uploadedFiles = json.salesContract?.documentFiles || [];
      const uploadedMandatoryCount = mandatoryDocs.filter((doc: any) =>
        uploadedFiles.some((file: any) => file.tradeDocumentId === doc.tradeDocumentId),
      ).length;

      json.documentProgress = {
        total: mandatoryDocs.length,
        uploaded: uploadedMandatoryCount,
        percentage: mandatoryDocs.length > 0 ? Math.round((uploadedMandatoryCount / mandatoryDocs.length) * 100) : 100,
        checklist: json.salesContract?.documents?.map((doc: any) => {
          const hasFile = uploadedFiles.some((file: any) => file.tradeDocumentId === doc.tradeDocumentId);
          return {
            name: doc.tradeDocument?.name || 'Document',
            isMandatory: doc.isMandatory,
            uploaded: hasFile,
          };
        }) || [],
      };

      return json;
    });

    return {
      data,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    };
  }

  async getStats(query: any) {
    const { whereClause, includes } = this.buildQueryOptions(query);
    const todayStr = new Date().toISOString().split('T')[0];
    const next7DaysObj = new Date();
    next7DaysObj.setDate(next7DaysObj.getDate() + 7);
    const next7DaysStr = next7DaysObj.toISOString().split('T')[0];

    // Fetch matching shipments to aggregate stats
    const shipments = await this.shipmentModel.findAll({
      where: whereClause,
      include: includes,
    });

    let total = shipments.length;
    let todayCount = 0;
    let upcoming7Days = 0;
    let delayedCount = 0;
    let inTransitCount = 0;
    let pendingDocsCount = 0;
    let totalContainers = 0;
    let totalQuantity = 0;

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
      if (dateStr > todayStr && dateStr <= next7DaysStr && status !== 'Delivered') {
        upcoming7Days++;
      }

      // Delayed
      if (dateStr < todayStr && status !== 'Delivered' && status !== 'Cancelled') {
        delayedCount++;
      }

      // Check document completeness
      const contract = s.salesContract;
      if (contract) {
        const mandatoryDocs = contract.documents?.filter((doc) => doc.isMandatory) || [];
        const uploadedFiles = contract.documentFiles || [];
        const missingMandatory = mandatoryDocs.some((doc) =>
          !uploadedFiles.some((file) => file.tradeDocumentId === doc.tradeDocumentId),
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

  async update(id: number, dto: UpdateShipmentDto) {
    const shipment = await this.shipmentModel.findByPk(id, {
      include: [{ model: SalesContract, as: 'salesContract' }],
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    // Capture changes to check if we need reference regeneration
    const hasCoreRefChanged =
      (dto.shipmentNo !== undefined && dto.shipmentNo !== shipment.shipmentNo) ||
      (dto.noOfContainers !== undefined && dto.noOfContainers !== shipment.noOfContainers) ||
      (dto.shipmentDate !== undefined && dto.shipmentDate !== shipment.shipmentDate.toString()) ||
      (dto.quantity !== undefined && dto.quantity !== shipment.quantity);

    // Apply updates
    if (dto.shipmentDate !== undefined) shipment.shipmentDate = new Date(dto.shipmentDate);
    if (dto.quantity !== undefined) shipment.quantity = dto.quantity;
    if (dto.noOfContainers !== undefined) shipment.noOfContainers = dto.noOfContainers;
    if (dto.ratePerMt !== undefined) shipment.ratePerMt = dto.ratePerMt;
    if (dto.purchaseRate !== undefined) shipment.purchaseRate = dto.purchaseRate;
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

    // Reload with associations
    return await this.shipmentModel.findByPk(id, {
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
              include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
            },
          ],
        },
      ],
    });
  }

}

