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
    try {
      const textCols = [
        'seller_signature',
        'seller_company_seal',
        'buyer_signature',
        'buyer_company_seal',
      ];
      for (const col of textCols) {
        await this.sequelize.query(
          `ALTER TABLE "sales_contracts" ALTER COLUMN "${col}" TYPE TEXT;`
        );
      }

      // Auto-migrate: Add print_overrides JSONB column if not exists
      await this.sequelize.query(
        `ALTER TABLE "sales_contracts" ADD COLUMN IF NOT EXISTS "print_overrides" JSONB;`
      );

      // Auto-migrate: Add missing shipment columns if not exists
      const shipmentCols = [
        { name: 'no_of_containers', type: 'INTEGER' },
        { name: 'rate_per_mt', type: 'DECIMAL(12, 2)' },
        { name: 'purchase_rate', type: 'DECIMAL(12, 2)' },
        { name: 'forex', type: 'DECIMAL(12, 2)' },
        { name: 'freight', type: 'DECIMAL(12, 2)' },
      ];
      for (const col of shipmentCols) {
        await this.sequelize.query(
          `ALTER TABLE "sales_contract_shipments" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};`
        );
      }
    } catch (err) {
      console.warn('[SalesContractService] Column alteration warning:', err?.message || err);
    }
  }



  async create(dto: CreateSalesContractDto, user: any): Promise<SalesContract> {
    const existing = await this.model.findOne({ where: { contractNumber: dto.contractNumber } });
    if (existing) {
      throw new BadRequestException(`Contract number "${dto.contractNumber}" already exists.`);
    }

    return await this.sequelize.transaction(async (t) => {

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
          totalQuantity: calculatedTotalQty,
          totalAmount: calculatedTotalAmt,
          contractDate: new Date(dto.contractDate),
          status: dto.status || 'Draft',
          createdBy: user?.userId,
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

  async findAll(query: QuerySalesContractDto) {
    const { search, status, buyerId, financialYear, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
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

  async findOne(id: number): Promise<SalesContract> {
    const item = await this.model.findByPk(id, {
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
    const contract = await this.findOne(id);

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

      // 2. Update Items (Destroy & Recreate for simplicity)
      if (dto.items) {
        await this.itemModel.destroy({ where: { salesContractId: contract.id }, transaction: t });
        if (dto.items.length > 0) {
          const itemsToCreate = dto.items.map((item) => ({ ...item, salesContractId: contract.id }));
          await this.itemModel.bulkCreate(itemsToCreate, { transaction: t });
        }
      }

      // 3. Update Shipments
      if (dto.shipments) {
        await this.shipmentModel.destroy({ where: { salesContractId: contract.id }, transaction: t });
        if (dto.shipments.length > 0) {
          const contractNo = (dto.contractNumber || contract.contractNumber)?.trim();
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
      }

      // 4. Update Documents
      if (dto.documents) {
        await this.documentModel.destroy({ where: { salesContractId: contract.id }, transaction: t });
        if (dto.documents.length > 0) {
          const docsToCreate = dto.documents.map((doc) => ({ ...doc, salesContractId: contract.id })) as any[];
          await this.documentModel.bulkCreate(docsToCreate, { transaction: t });
        }
      }
    });

    return await this.findOne(id);
  }

  async updateStatus(id: number, dto: UpdateSalesContractStatusDto, user: any): Promise<SalesContract> {
    const contract = await this.findOne(id);

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

  async getDistinctFinancialYears(): Promise<string[]> {
    const results = await this.sequelize.query<{ financial_year: string }>(
      `SELECT DISTINCT financial_year FROM sales_contracts WHERE financial_year IS NOT NULL ORDER BY financial_year DESC`,
      { type: QueryTypes.SELECT },
    );
    return results.map((r) => r.financial_year);
  }

  async getDocuments(id: number) {
    const contract = await this.findOne(id);

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
    const contract = await this.findOne(id);
    if (contract.status !== 'Draft' && contract.status !== 'Cancelled') {
      throw new BadRequestException('Only Draft or Cancelled contracts can be deleted');
    }
    await contract.update({ status: 'Cancelled', updatedBy: user?.userId });
    return contract.reload();
  }
}
