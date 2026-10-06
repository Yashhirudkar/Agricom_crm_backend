import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SalesContract } from './models/sales-contract.model';
import { SalesContractItem } from './models/sales-contract-item.model';
import { SalesContractShipment } from './models/sales-contract-shipment.model';
import { SalesContractDocument } from './models/sales-contract-document.model';
import { SalesContractDocumentFile } from './models/sales-contract-document-file.model';
import { AttachmentsService } from '../attachments/services/attachments.service';
import { Attachment } from '../attachments/models/attachment.model';
import { Partner } from '../masters/partner/partner.model';
import { Product } from '../masters/product/product.model';

import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import { UpdateSalesContractDto, UpdateSalesContractStatusDto } from './dto/update-sales-contract.dto';
import { QuerySalesContractDto } from './dto/query-sales-contract.dto';
import { generateShipmentReference } from './utils/shipment-reference.util';
import {
  getAutoContractConfig,
  generateNextContractNumber,
  getFySuffix,
  parseSequenceFromContractNumber,
  buildContractPrefix,
} from './utils/contract-number.util';

@Injectable()
export class SalesContractService implements OnModuleInit {
  constructor(
    @InjectModel(SalesContract)
    private readonly model: typeof SalesContract,
    @InjectModel(SalesContractItem)
    private readonly itemModel: typeof SalesContractItem,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(SalesContractDocument)
    private readonly documentModel: typeof SalesContractDocument,
    @InjectModel(SalesContractDocumentFile)
    private readonly documentFileModel: typeof SalesContractDocumentFile,
    private readonly attachmentsService: AttachmentsService,
    private readonly sequelize: Sequelize,
  ) { }

  async onModuleInit() {
    // Schema modifications are handled by database migrations (phase-06-sales & phase-07-shipments)
  }

  private async validateForeignKeys(companyId: number, dto: any) {
    if (dto.buyerId) {
      const buyer = await Partner.findOne({ where: { id: dto.buyerId, companyId } });
      if (!buyer) throw new BadRequestException('Buyer not found or does not belong to company');
    }
    if (dto.sellerId) {
      const seller = await Partner.findOne({ where: { id: dto.sellerId, companyId } });
      if (!seller) throw new BadRequestException('Seller not found or does not belong to company');
    }
    if (dto.brokerId) {
      const broker = await Partner.findOne({ where: { id: dto.brokerId, companyId } });
      if (!broker) throw new BadRequestException('Broker not found or does not belong to company');
    }
    if (dto.shipmentTypeId) {
      const st = await ShipmentType.findOne({ where: { id: dto.shipmentTypeId, companyId } });
      if (!st) throw new BadRequestException('Shipment Type not found or does not belong to company');
    }
    if (dto.paymentTermId) {
      const pt = await PaymentTerm.findOne({ where: { id: dto.paymentTermId, companyId } });
      if (!pt) throw new BadRequestException('Payment Term not found or does not belong to company');
    }

    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        if (item.productId) {
          const prod = await Product.findOne({ where: { id: item.productId, companyId } });
          if (!prod) throw new BadRequestException('Product not found or does not belong to company');
        }
        if (item.bagTypeId) {
          const bagType = await BagType.findOne({ where: { id: item.bagTypeId, companyId } });
          if (!bagType) throw new BadRequestException('Bag Type not found or does not belong to company');
        }
        if (item.packingTypeId) {
          const pack = await PackingType.findOne({ where: { id: item.packingTypeId, companyId } });
          if (!pack) throw new BadRequestException('Packing Type not found or does not belong to company');
        }
        if (item.bagSpecificationId) {
          const spec = await BagSpecification.findOne({ where: { id: item.bagSpecificationId, companyId } });
          if (!spec) throw new BadRequestException('Bag Specification not found or does not belong to company');
        }
      }
    }
  }

  async create(dto: CreateSalesContractDto, user: any): Promise<SalesContract> {
    const companyId: number = user?.companyId;

    // ── Step 1: Determine if this is an Agricom auto-number seller ──────────
    let resolvedContractNumber: string = dto.contractNumber?.trim() || '';
    let isAutoGenerated = false;

    if (dto.sellerId) {
      const seller = await Partner.findOne({ where: { id: dto.sellerId } });
      if (seller) {
        const autoConfig = getAutoContractConfig(seller.entityName);
        if (autoConfig) {
          isAutoGenerated = true;
        }
      }
    }

    // ── Step 2: For non-auto sellers, validate contractNumber is supplied ───
    if (!isAutoGenerated) {
      if (!resolvedContractNumber) {
        throw new BadRequestException('Contract No. is required.');
      }
      const existing = await this.model.findOne({
        where: { contractNumber: resolvedContractNumber, companyId },
      });
      if (existing) {
        throw new BadRequestException(
          `Contract number "${resolvedContractNumber}" already exists.`,
        );
      }
    }

    // Prevent converting the same Confirmed Order into multiple Sales Contracts
    if (dto.enquiryId) {
      const alreadyConverted = await this.model.findOne({
        where: { enquiryId: dto.enquiryId, companyId },
        attributes: ['id', 'contractNumber'],
      });
      if (alreadyConverted) {
        throw new BadRequestException(
          `This order is already converted to Sales Contract "${alreadyConverted.contractNumber}".`,
        );
      }
    }

    await this.validateForeignKeys(companyId, dto);

    return await this.sequelize.transaction(async (t) => {

          // ── Step 3: Auto-generate contract number inside the transaction ───────
      if (isAutoGenerated) {
        const seller = await Partner.findOne({ where: { id: dto.sellerId } });
        const buyer = await Partner.findOne({ where: { id: dto.buyerId } });
        resolvedContractNumber = await generateNextContractNumber({
          sequelize: this.sequelize,
          sellerId: dto.sellerId,
          sellerName: seller.entityName,
          buyerName: buyer.entityName,
          financialYear: dto.financialYear,
          transaction: t,
        });

        // Double-check uniqueness (handles edge cases with legacy data)
        const duplicate = await this.model.findOne({
          where: { contractNumber: resolvedContractNumber, companyId },
          transaction: t,
        });
        if (duplicate) {
          throw new BadRequestException(
            `Generated contract number "${resolvedContractNumber}" already exists. Please retry.`,
          );
        }
      }

      // Enforce Data Integrity: Recalculate Totals
      let calculatedTotalQty = 0;
      let calculatedTotalAmt = 0;
      if (dto.items && dto.items.length > 0) {
        dto.items.forEach((item) => {
          item.amount = parseFloat((item.quantity * item.unitPrice).toFixed(2));
          calculatedTotalQty += item.quantity;
          calculatedTotalAmt += item.amount;
        });
      }

      // 2. Create Header
      const contract = await this.model.create(
        {
          ...dto,
          contractNumber: resolvedContractNumber,
          totalQuantity: calculatedTotalQty,
          totalAmount: calculatedTotalAmt,
          contractDate: new Date(dto.contractDate),
          status: dto.status || 'Draft',
          createdBy: user?.userId,
          companyId,
        } as any,
        { transaction: t },
      );

      // 3. Create Items
      if (dto.items && dto.items.length > 0) {
        const itemsToCreate = dto.items.map((item) => ({
          ...item,
          salesContractId: contract.id,
        }));
        await this.itemModel.bulkCreate(itemsToCreate, { transaction: t });
      }

      // 4. Create Shipments
      if (dto.shipments && dto.shipments.length > 0) {
        const contractNo = (contract.contractNumber || dto.contractNumber)?.trim();
        const shipmentsToCreate = dto.shipments.map((shipment, index) => {
          const sNo = shipment.shipmentNo || (index + 1);
          return {
            ...shipment,
            shipmentNo: sNo,
            status: shipment.status || 'Scheduled',
            shipmentDate: new Date(shipment.shipmentDate),
            salesContractId: contract.id,
            shipmentReference: generateShipmentReference(
              contractNo,
              sNo,
              shipment.noOfContainers,
              shipment.shipmentDate,
              shipment.quantity,
            ),
          };
        }) as any[];
        await this.shipmentModel.bulkCreate(shipmentsToCreate, { transaction: t });
      }

      // 5. Create Documents
      if (dto.documents && dto.documents.length > 0) {
        const docsToCreate = dto.documents.map((doc) => ({
          ...doc,
          salesContractId: contract.id,
        })) as any[];
        await this.documentModel.bulkCreate(docsToCreate, { transaction: t });
      }

      return contract;
    });
  }

  async findAll(query: QuerySalesContractDto & { companyId?: number }) {
    const { search, status, buyerId, financialYear, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    // Tenant isolation
    if (query.companyId) whereClause.companyId = query.companyId;
    if (search) {
      whereClause.contractNumber = { [Op.iLike]: `%${search}%` };
    }
    if (status) whereClause.status = status;
    if (buyerId) whereClause.buyerId = buyerId;
    if (financialYear) whereClause.financialYear = financialYear;

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      include: [
        { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
        { model: SalesContractDocument, attributes: ['id'] },
        { model: SalesContractDocumentFile, attributes: ['id'] },
        {
          model: SalesContractItem,
          include: [{ model: Product, attributes: ['name'] }],
        },
      ],
      distinct: true,
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

  async findOne(id: number, companyId?: number): Promise<SalesContract> {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const item = await this.model.findOne({
      where,
      include: [
        { model: Partner, as: 'buyer' },
        { model: Partner, as: 'seller' },
        { model: Partner, as: 'broker' },
        { model: ShipmentType },
        { model: PaymentTerm },
        {
          model: SalesContractItem,
          include: [Product, BagType, PackingType, BagSpecification],
        },
        { model: SalesContractShipment },
        {
          model: SalesContractDocument,
          include: [TradeDocument],
        },
      ],
    });

    if (!item) {
      throw new NotFoundException('Sales Contract not found');
    }
    return item;
  }

  async update(id: number, dto: UpdateSalesContractDto, user: any): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);

    await this.validateForeignKeys(user?.companyId, dto);

    await this.sequelize.transaction(async (t) => {
      // Enforce Data Integrity: Recalculate Totals
      let calculatedTotalQty = dto.totalQuantity || contract.totalQuantity;
      let calculatedTotalAmt = dto.totalAmount || contract.totalAmount;
      if (dto.items && dto.items.length > 0) {
        calculatedTotalQty = 0;
        calculatedTotalAmt = 0;
        dto.items.forEach((item) => {
          item.amount = parseFloat((item.quantity * item.unitPrice).toFixed(2));
          calculatedTotalQty += item.quantity;
          calculatedTotalAmt += item.amount;
        });
      }

      // 1. Update Header
      const updateData: any = {
        ...dto,
        totalQuantity: calculatedTotalQty,
        totalAmount: calculatedTotalAmt,
        updatedBy: user?.userId
      };
      if (dto.contractDate) {
        updateData.contractDate = new Date(dto.contractDate);
      }
      await contract.update(updateData, { transaction: t });

      // 2. Update Items
      if (dto.items) {
        const existingItems = await this.itemModel.findAll({
          where: { salesContractId: contract.id },
          transaction: t,
        });
        const updatedItemIds: number[] = [];

        for (let index = 0; index < dto.items.length; index++) {
          const item = dto.items[index] as any;
          let existing = existingItems.find(
            (i) => (item.id && i.id === item.id),
          );
          if (!existing && index < existingItems.length && !item.id) {
            existing = existingItems[index];
          }

          if (existing) {
            await existing.update(
              {
                ...item,
                salesContractId: contract.id,
              },
              { transaction: t },
            );
            updatedItemIds.push(existing.id);
          } else {
            const created = await this.itemModel.create(
              {
                ...item,
                salesContractId: contract.id,
              } as any,
              { transaction: t },
            );
            updatedItemIds.push(created.id);
          }
        }

        const itemsToDelete = existingItems.filter((i) => !updatedItemIds.includes(i.id));
        for (const item of itemsToDelete) {
          await item.destroy({ transaction: t });
        }
      }

      // 3. Update Shipments (In-place update to preserve PKs & FK links, e.g. purchase_contract_shipments)
      if (dto.shipments) {
        const existingShipments = await this.shipmentModel.findAll({
          where: { salesContractId: contract.id },
          transaction: t,
        });

        const contractNo = (dto.contractNumber || contract.contractNumber)?.trim();
        const updatedShipmentIds: number[] = [];

        for (let index = 0; index < dto.shipments.length; index++) {
          const shipment = dto.shipments[index] as any;
          const sNo = shipment.shipmentNo || (index + 1);

          let existing = existingShipments.find(
            (s) => (shipment.id && s.id === shipment.id) || s.shipmentNo === sNo,
          );
          if (!existing && index < existingShipments.length && !shipment.id) {
            existing = existingShipments[index];
          }

          const shipmentRef = generateShipmentReference(
            contractNo,
            sNo,
            shipment.noOfContainers,
            shipment.shipmentDate,
            shipment.quantity,
          );

          if (existing) {
            await existing.update(
              {
                ...shipment,
                shipmentNo: sNo,
                shipmentDate: new Date(shipment.shipmentDate),
                shipmentReference: shipmentRef,
                status: shipment.status || existing.status || 'Scheduled',
              },
              { transaction: t },
            );
            updatedShipmentIds.push(existing.id);
          } else {
            const created = await this.shipmentModel.create(
              {
                ...shipment,
                salesContractId: contract.id,
                shipmentNo: sNo,
                shipmentDate: new Date(shipment.shipmentDate),
                shipmentReference: shipmentRef,
                status: shipment.status || 'Scheduled',
              } as any,
              { transaction: t },
            );
            updatedShipmentIds.push(created.id);
          }
        }

        const shipmentsToDelete = existingShipments.filter(
          (s) => !updatedShipmentIds.includes(s.id),
        );
        for (const s of shipmentsToDelete) {
          try {
            await s.destroy({ transaction: t });
          } catch (err: any) {
            if (
              err.name === 'SequelizeDatabaseError' ||
              err.code === '23001' ||
              err.parent?.code === '23001'
            ) {
              throw new BadRequestException(
                `Cannot remove Shipment #${s.shipmentNo} (${
                  s.shipmentReference || 'ID ' + s.id
                }) because it is linked to a Purchase Contract or execution record. Please unlink it before deleting.`,
              );
            }
            throw err;
          }
        }
      }

      // 4. Update Documents
      if (dto.documents) {
        const existingDocs = await this.documentModel.findAll({
          where: { salesContractId: contract.id },
          transaction: t,
        });

        const updatedDocIds: number[] = [];

        for (let index = 0; index < dto.documents.length; index++) {
          const doc = dto.documents[index] as any;
          let existing = existingDocs.find(
            (d) => (doc.id && d.id === doc.id) || d.tradeDocumentId === doc.tradeDocumentId,
          );
          if (!existing && index < existingDocs.length && !doc.id) {
            existing = existingDocs[index];
          }

          if (existing) {
            await existing.update(
              {
                ...doc,
                salesContractId: contract.id,
              },
              { transaction: t },
            );
            updatedDocIds.push(existing.id);
          } else {
            const created = await this.documentModel.create(
              {
                ...doc,
                salesContractId: contract.id,
              } as any,
              { transaction: t },
            );
            updatedDocIds.push(created.id);
          }
        }

        const docsToDelete = existingDocs.filter((d) => !updatedDocIds.includes(d.id));
        for (const doc of docsToDelete) {
          await doc.destroy({ transaction: t });
        }
      }
    });

    return await this.findOne(id);
  }

  async updateStatus(id: number, dto: UpdateSalesContractStatusDto, user: any): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);

    if (dto.status === 'Active') {
      const mandatoryDocs = contract.documents.filter(doc => doc.isMandatory);
      if (mandatoryDocs.length > 0) {
        const uploadedFiles = await this.documentFileModel.findAll({
          where: { salesContractId: id }
        });

        const missingDocs = [];
        for (const doc of mandatoryDocs) {
          const hasFile = uploadedFiles.some(f => f.tradeDocumentId === doc.tradeDocumentId);
          if (!hasFile) {
            missingDocs.push(doc.tradeDocument.name);
          }
        }

        if (missingDocs.length > 0) {
          throw new BadRequestException(`Cannot activate contract.\nMissing Documents:\n- ${missingDocs.join('\n- ')}`);
        }
      }
    }

    await contract.update({ status: dto.status, updatedBy: user?.userId });
    return contract.reload();
  }

  async getDistinctFinancialYears(companyId?: number): Promise<string[]> {
    const whereSql = companyId ? `WHERE company_id = ${companyId} AND financial_year IS NOT NULL` : `WHERE financial_year IS NOT NULL`;
    const results = await this.sequelize.query<{ financial_year: string }>(
      `SELECT DISTINCT financial_year FROM sales_contracts ${whereSql} ORDER BY financial_year DESC`,
      { type: QueryTypes.SELECT },
    );
    return results.map((r) => r.financial_year);
  }

  /**
   * Preview the next contract number for a given seller + buyer + financial year.
   * This is NOT atomic — only for UI preview purposes.
   * The final contract number is always regenerated atomically inside create().
   */
  async getNextContractNumber(
    sellerId: number,
    buyerId: number,
    financialYear: string,
  ): Promise<{ contractNo: string } | null> {
    const seller = await Partner.findOne({ where: { id: sellerId } });
    if (!seller) {
      throw new BadRequestException('Seller not found.');
    }

    const autoConfig = getAutoContractConfig(seller.entityName);
    if (!autoConfig) {
      // Not an Agricom seller — no auto number
      return null;
    }

    const buyer = await Partner.findOne({ where: { id: buyerId } });
    if (!buyer) {
      throw new BadRequestException('Buyer not found.');
    }

    const { sellerCode, initialSequence, includeBuyerInitial } = autoConfig;
    let fySuffix: string;
    try {
      fySuffix = getFySuffix(financialYear);
    } catch {
      return null;
    }

    // Find max existing sequence for this seller + FY (non-locking, preview only).
    // Sequence is seller-wide — query all contracts for seller + FY regardless of buyer.
    const rows = await this.sequelize.query<{ contract_number: string }>(
      `SELECT contract_number
       FROM sales_contracts
       WHERE seller_id = :sellerId
         AND financial_year = :financialYear
         AND contract_number IS NOT NULL`,
      {
        replacements: { sellerId, financialYear },
        type: QueryTypes.SELECT,
      },
    );

    let maxSequence: number | null = null;
    for (const row of rows) {
      const seq = parseSequenceFromContractNumber(row.contract_number, sellerCode, fySuffix, includeBuyerInitial);
      if (seq !== null && (maxSequence === null || seq > maxSequence)) {
        maxSequence = seq;
      }
    }

    const nextSequence = maxSequence !== null ? maxSequence + 4 : initialSequence;
    // Build prefix: buyer initial (if applicable) + seller code
    const prefix = buildContractPrefix(buyer.entityName, sellerCode, includeBuyerInitial);
    return { contractNo: `${prefix}.${nextSequence}${fySuffix}` };
  }

  async getDocuments(id: number, companyId?: number) {
    const contract = await this.findOne(id, companyId);

    const mappingFiles = await this.documentFileModel.findAll({
      where: { salesContractId: id },
      include: [Attachment, TradeDocument],
    });

    const docMap = new Map<number, any>();

    // 1. Populate from contract.documents (saved documents)
    for (const doc of contract.documents) {
      if (doc.tradeDocument) {
        const mapping = mappingFiles.find(f => f.tradeDocumentId === doc.tradeDocumentId);
        docMap.set(doc.tradeDocumentId, {
          tradeDocument: {
            id: doc.tradeDocument.id,
            name: doc.tradeDocument.name,
            mandatoryByDefault: doc.tradeDocument.mandatoryByDefault,
          },
          uploaded: !!mapping,
          attachment: (mapping && mapping.attachment) ? {
            id: mapping.attachment.id,
            originalName: mapping.attachment.originalName,
            mimeType: mapping.attachment.mimeType,
            fileSize: mapping.attachment.fileSize,
            downloadUrl: `/attachments/${mapping.attachment.id}/download`,
          } : null,
        });
      }
    }

    // 2. Add any mappings that aren't in contract.documents yet
    for (const mapping of mappingFiles) {
      if (!docMap.has(mapping.tradeDocumentId) && mapping.tradeDocument) {
        docMap.set(mapping.tradeDocumentId, {
          tradeDocument: {
            id: mapping.tradeDocument.id,
            name: mapping.tradeDocument.name,
            mandatoryByDefault: mapping.tradeDocument.mandatoryByDefault,
          },
          uploaded: true,
          attachment: mapping.attachment ? {
            id: mapping.attachment.id,
            originalName: mapping.attachment.originalName,
            mimeType: mapping.attachment.mimeType,
            fileSize: mapping.attachment.fileSize,
            downloadUrl: `/attachments/${mapping.attachment.id}/download`,
          } : null,
        });
      }
    }

    return Array.from(docMap.values());
  }

  async uploadDocument(id: number, tradeDocumentId: number, file: Express.Multer.File, user: any, companyId: number) {
    // 1. Create attachment via central engine
    const attachment = await this.attachmentsService.createAttachment(file, user?.userId, companyId);

    // 2. Check if mapping already exists
    const existingMapping = await this.documentFileModel.findOne({
      where: { salesContractId: id, tradeDocumentId },
    });

    if (existingMapping) {
      // 3. Re-upload flow: delete old attachment (engine handles file + generic row)
      await this.attachmentsService.deleteAttachment(existingMapping.attachmentId);

      // 4. Update mapping
      await existingMapping.update({
        attachmentId: attachment.id,
        uploadedBy: user?.userId,
      });
      return existingMapping;
    } else {
      // Create new mapping
      return await this.documentFileModel.create({
        salesContractId: id,
        tradeDocumentId,
        attachmentId: attachment.id,
        uploadedBy: user?.userId,
      });
    }
  }

  async deleteDocument(id: number, tradeDocumentId: number) {
    const existingMapping = await this.documentFileModel.findOne({
      where: { salesContractId: id, tradeDocumentId },
    });

    if (!existingMapping) {
      throw new NotFoundException('Document mapping not found');
    }

    // 1. Delete attachment via central engine
    await this.attachmentsService.deleteAttachment(existingMapping.attachmentId);

    // 2. Delete mapping row
    await existingMapping.destroy();

    return { success: true };
  }

  async remove(id: number, user: any): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);
    if (contract.status !== 'Draft' && contract.status !== 'Cancelled') {
      throw new BadRequestException('Only Draft or Cancelled contracts can be deleted');
    }
    await contract.update({ status: 'Cancelled', updatedBy: user?.userId });
    return contract.reload();
  }
}
