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
import { Enquiry } from '../../enquiries/models/enquiry.model';
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

    const company = (await this.sequelize.models.Company.findByPk(companyId)) as any;
    const companyCountry = company?.country;

    // ── Base Enquiry Conditions ───────────────────────────────────────────────
    // Exclude cancelled enquiries (show NEW, PENDING, CONFIRMED, CLOSED, etc.)
    const whereConditions: any[] = [
      { status: { [Op.notIn]: ['CANCELLED'] } },
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
          model: Logistics,
          as: 'logistics',
          required: effectiveStatus === 'Closed',
          include: [
            {
              model: FreightQuote,
              as: 'selectedFreight',
              required: false,
              include: [{ model: Partner, as: 'seller', attributes: ['id', 'entityName'] }],
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
   * Get detail logistics workspace of an enquiry.
   * Auto-creates the Logistics record if missing.
   */
  async getDetails(enquiryId: string, companyId: number = 1) {
    const enquiry = await this.enquiryModel.findByPk(enquiryId, {
      include: [
        { model: Partner, as: 'partner' },
        { model: Product, as: 'product' },
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
          include: [{ model: Partner, as: 'seller' }],
        },
        {
          model: FreightQuote,
          as: 'selectedFreight',
          include: [{ model: Partner, as: 'seller' }],
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
          { transaction }
        );
        const [seqRes]: any = await this.sequelize.query(
          `SELECT nextval('logistics_no_seq')`,
          { type: QueryTypes.SELECT, transaction } as any
        );
        const nextVal = parseInt(seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1', 10);
        const currentYear = new Date().getFullYear();
        const logisticsNumber = `LOG/${currentYear}/${String(nextVal).padStart(6, '0')}`;

        // Infer Mode & Transport Mode
        const mode = enquiry.shipmentMode === 'SHIP' ? 'International' : 'Domestic';
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
          } as any,
          { transaction }
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
            include: [{ model: Partner, as: 'seller' }],
          },
          {
            model: FreightQuote,
            as: 'selectedFreight',
            include: [{ model: Partner, as: 'seller' }],
          },
        ],
      });
    }

    // Look up if a SalesContract exists for this enquiry
    const salesContract = await this.salesContractModel.findOne({
      where: { enquiryId },
      attributes: ['id', 'contractNumber'],
    });

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
  async createFreightQuote(logisticsId: number, dto: CreateFreightQuoteDto, user: any, companyId: number = 1) {
    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    return await this.sequelize.transaction(async (transaction) => {
      // Generate FQ/YYYY/###### number via sequence
      await this.sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS freight_quotes_no_seq START 1;`,
        { transaction }
      );
      const [seqRes]: any = await this.sequelize.query(
        `SELECT nextval('freight_quotes_no_seq')`,
        { type: QueryTypes.SELECT, transaction } as any
      );
      const nextVal = parseInt(seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1', 10);
      const currentYear = new Date().getFullYear();
      const quoteNumber = `FQ/${currentYear}/${String(nextVal).padStart(6, '0')}`;

      const quote = await this.quoteModel.create(
        {
          ...dto,
          quoteNumber,
          logisticsId,
          createdBy: user?.userId,
        } as any,
        { transaction }
      );

      // Auto-sync manual contact to Partner Master if provided
      await this.syncContactToPartner(
        dto.sellerId,
        dto.contactPerson,
        dto.contactNumber,
        transaction
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
          newValue: { status: 'Quotes Received', remarks: 'System updated status upon first quote entry' },
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
        newValue: { quoteNumber, sellerId: dto.sellerId, freightAmount: dto.freightAmount },
      });

      return quote;
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
    companyId: number = 1
  ) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    await this.sequelize.transaction(async (transaction) => {
      // Increment version placeholder
      const newVersion = (quote.version || 1) + 1;

      await quote.update(
        {
          ...dto,
          version: newVersion,
          updatedBy: user?.userId,
        } as any,
        { transaction }
      );

      // Auto-sync manual contact to Partner Master if provided
      await this.syncContactToPartner(
        dto.sellerId,
        dto.contactPerson,
        dto.contactNumber,
        transaction
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

    return quote.reload({ include: [{ model: Partner, as: 'seller' }] });
  }

  /**
   * Auto-sync manual contact person to Partner Master (partner_contacts table)
   */
  private async syncContactToPartner(
    sellerId?: number,
    contactPerson?: string,
    contactNumber?: string,
    transaction?: any
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
        (c) => c.name?.toLowerCase().trim() === contactName.toLowerCase()
      );

      if (!exists) {
        await this.partnerContactModel.create(
          {
            partnerId: sId,
            name: contactName,
            phone: phone,
            isPrimary: existingContacts.length === 0,
          } as any,
          { transaction }
        );
      }
    } catch (e) {
      console.error('[LogisticsService] Contact Auto-Sync Error:', e);
    }
  }

  /**
   * Delete a freight quote (restricted if preferred).
   */
  async deleteFreightQuote(logisticsId: number, quoteId: number, user: any, companyId: number = 1) {
    const quote = await this.quoteModel.findOne({
      where: { id: quoteId, logisticsId },
    });
    if (!quote) {
      throw new NotFoundException('Freight quote not found');
    }

    if (quote.isPreferred) {
      throw new BadRequestException(
        'Cannot delete preferred quote. Please mark another quote as preferred or clear preferred selection first.'
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
  async setPreferredQuote(logisticsId: number, quoteId: number, user: any, companyId: number = 1) {
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
      // 1. Mark this quote as preferred, others as rejected
      await this.quoteModel.update(
        { isPreferred: false, isRejected: true },
        { where: { logisticsId }, transaction }
      );

      await quote.update(
        { isPreferred: true, isRejected: false },
        { transaction }
      );

      // 2. Link selected quote and update Logistics status to Preferred Quote Selected
      const oldStatus = logistics.status;
      await logistics.update(
        {
          selectedFreightId: quote.id,
          status: 'Preferred Quote Selected',
          updatedBy: user?.userId,
        },
        { transaction }
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
  async updateStatus(logisticsId: number, dto: UpdateLogisticsStatusDto, user: any, companyId: number = 1) {
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
  async generateShipment(logisticsId: number, user: any, companyId: number = 1) {
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
      throw new BadRequestException('Please select a preferred freight quote before generating shipment.');
    }

    // Lookup Sales Contract linked via ForeignKey enquiryId
    const salesContract = await this.salesContractModel.findOne({
      where: { enquiryId: logistics.enquiryId },
      include: [{ model: SalesContractShipment }],
    });

    if (!salesContract) {
      throw new BadRequestException(
        'No executed Sales Contract found for this enquiry. Please execute the Sales Contract first.'
      );
    }

    // Verify if shipment is already generated
    const existingShipment = await this.shipmentModel.findOne({
      where: { salesContractId: salesContract.id, logisticsId: logistics.id },
    });
    if (existingShipment) {
      throw new BadRequestException('A shipment has already been generated for this logistics workspace.');
    }

    return await this.sequelize.transaction(async (transaction) => {
      const quote = logistics.selectedFreight;
      const shipmentNo = (salesContract.shipments?.length || 0) + 1;

      // Extract shipment details from preferred quote
      const shipmentDate = logistics.estimatedDispatchDate || quote.etd || new Date();
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
        } as any,
        { transaction }
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
        newValue: { shipmentId: shipment.id, shipmentNo, shipmentReference: logistics.logisticsNumber },
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
    companyId: number = 1
  ) {
    const logistics = await this.logisticsModel.findByPk(logisticsId);
    if (!logistics) {
      throw new NotFoundException('Logistics record not found');
    }

    return await this.sequelize.transaction(async (transaction) => {
      // 1. Create central attachment row via central engine
      const attachment = await this.attachmentsService.createAttachment(file, user?.userId, companyId);

      // 2. Update attachment to link polymorphically
      await attachment.update(
        {
          entityType: 'LOGISTICS',
          entityId: logisticsId,
          // Storing category in fileName or remarks if category is not explicitly supported,
          // but wait! Attachments has category in some legacy models. Here we can store it in originalName as metadata or prefix it,
          // or since attachments table doesn't have a category field, we can prefix the originalName with `[Category] `,
          // or just write it. Prefixing originalName with category (e.g. "Rate Sheet - invoice.pdf") makes it visually explicit!
          originalName: category ? `${category} - ${file.originalname}` : file.originalname,
        },
        { transaction }
      );

      // 3. Log event
      await this.auditService.writeLog({
        clientId: null,
        companyId,
        userId: user?.userId,
        entityType: 'Logistics',
        entityId: logisticsId,
        action: 'ATTACHMENT_UPLOADED',
        newValue: { attachmentId: attachment.id, category, fileName: attachment.originalName },
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

  async deleteAttachment(logisticsId: number, attachmentId: number, user: any, companyId: number = 1) {
    const attachment = await this.attachmentModel.findOne({
      where: { id: attachmentId, entityType: 'LOGISTICS', entityId: logisticsId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found under this logistics workspace');
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
