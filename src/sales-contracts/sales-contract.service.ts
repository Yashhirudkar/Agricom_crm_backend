import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SalesContract } from './models/sales-contract.model';
import { SalesContractItem } from './models/sales-contract-item.model';
import { SalesContractShipment } from './models/sales-contract-shipment.model';
import { SalesContractDocument } from './models/sales-contract-document.model';
import { FinancialYear } from '../masters/financial-year/financial-year.model';
import { Partner } from '../masters/partner/partner.model';
import { Product } from '../masters/product/product.model';

import { Country } from '../masters/country/country.model';
import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import { UpdateSalesContractDto, UpdateSalesContractStatusDto } from './dto/update-sales-contract.dto';
import { QuerySalesContractDto } from './dto/query-sales-contract.dto';

@Injectable()
export class SalesContractService {
  constructor(
    @InjectModel(SalesContract)
    private readonly model: typeof SalesContract,
    @InjectModel(SalesContractItem)
    private readonly itemModel: typeof SalesContractItem,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(SalesContractDocument)
    private readonly documentModel: typeof SalesContractDocument,
    @InjectModel(FinancialYear)
    private readonly fyModel: typeof FinancialYear,
    private readonly sequelize: Sequelize,
  ) {}



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
        const shipmentsToCreate = dto.shipments.map((shipment) => ({
          ...shipment,
          shipmentDate: new Date(shipment.shipmentDate),
          salesContractId: contract.id,
        })) as any[];
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
    const { search, status, buyerId, financialYearId, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause.contractNumber = { [Op.iLike]: `%${search}%` };
    }
    if (status) whereClause.status = status;
    if (buyerId) whereClause.buyerId = buyerId;
    if (financialYearId) whereClause.financialYearId = financialYearId;

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      include: [
        { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
      ],
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
        { model: FinancialYear },
        { model: Partner, as: 'buyer' },
        { model: Partner, as: 'broker' },
        { model: ShipmentType },
        { model: PaymentTerm },
        { model: Country, as: 'originCountry' },
        { model: Country, as: 'destinationCountry' },
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
    // Allowed updates for any status for now, as requested.
    // if (contract.status !== 'Draft') {
    //   throw new BadRequestException('Only Draft contracts can be fully updated');
    // }

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
          const shipmentsToCreate = dto.shipments.map((shipment) => ({
            ...shipment,
            shipmentDate: new Date(shipment.shipmentDate),
            salesContractId: contract.id,
          })) as any[];
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
    await contract.update({ status: dto.status, updatedBy: user?.userId });
    return contract.reload();
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
