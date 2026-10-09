import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PurchaseContract } from '../models/purchase-contract.model';
import { PurchaseContractItem } from '../models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { Product } from '../../masters/product/product.model';
import { CreatePurchaseContractDto } from '../dto/create-purchase-contract.dto';
import {
  UpdatePurchaseContractDto,
  UpdatePurchaseContractStatusDto,
} from '../dto/update-purchase-contract.dto';
import {
  PurchaseContractActivityService,
  PC_ACTIONS,
} from './purchase-contract-activity.service';

// Status transition rules
const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ['In Progress', 'Cancelled'],
  'In Progress': [
    'Awaiting Documents',
    'Ready for Dispatch',
    'Completed',
    'Cancelled',
  ],
  'Awaiting Documents': [
    'In Progress',
    'Ready for Dispatch',
    'Completed',
    'Cancelled',
  ],
  'Ready for Dispatch': ['Completed', 'Cancelled'],
  Completed: ['Closed'],
  Closed: [],
  Cancelled: [],
};

@Injectable()
export class PurchaseContractService {
  constructor(
    @InjectModel(PurchaseContract)
    private readonly model: typeof PurchaseContract,
    @InjectModel(PurchaseContractItem)
    private readonly itemModel: typeof PurchaseContractItem,
    @InjectModel(PurchaseContractShipment)
    private readonly shipmentLinkModel: typeof PurchaseContractShipment,
    @InjectModel(PurchaseContractRequiredDocument)
    private readonly docModel: typeof PurchaseContractRequiredDocument,
    @InjectModel(SalesContract)
    private readonly salesContractModel: typeof SalesContract,
    @InjectModel(SalesContractShipment)
    private readonly salesShipmentModel: typeof SalesContractShipment,
    private readonly activityService: PurchaseContractActivityService,
    private readonly sequelize: Sequelize,
  ) {}

  private async validateForeignKeys(companyId: number, dto: any) {
    if (dto.buyerId) {
      const buyer = await Partner.findOne({
        where: { id: dto.buyerId, companyId },
      });
      if (!buyer)
        throw new BadRequestException(
          'Buyer not found or does not belong to company',
        );
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
    if (dto.brokerId) {
      const broker = await Partner.findOne({
        where: { id: dto.brokerId, companyId },
      });
      if (!broker)
        throw new BadRequestException(
          'Broker not found or does not belong to company',
        );
    }
    if (dto.paymentTermId) {
      const pt = await PaymentTerm.findOne({
        where: { id: dto.paymentTermId, companyId },
      });
      if (!pt)
        throw new BadRequestException(
          'Payment Term not found or does not belong to company',
        );
    }
  }

  /**
   * Auto-create flow: Called by ShipmentService after first shipment save.
   * Idempotent — if PC already exists for this sales contract, returns it.
   */
  async ensureExists(
    salesContractId: number,
    userId?: number,
    initialShipmentIds?: number[],
  ): Promise<PurchaseContract> {
    let pc = await this.model.findOne({ where: { salesContractId } });

    if (!pc) {
      const salesContract = await this.salesContractModel.findByPk(
        salesContractId,
        {
          attributes: ['id', 'contractNumber', 'companyId', 'sellerId'],
        },
      );
      if (!salesContract)
        throw new NotFoundException('Sales Contract not found');

      pc = await this.model.create({
        salesContractId,
        purchaseType: 'SC',
        buyerId: salesContract.sellerId || null,
        status: 'Draft',
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
        companyId: salesContract.companyId,
      });

      await this.activityService.log(
        pc.id,
        PC_ACTIONS.PC_CREATED,
        `Purchase Contract PC-${salesContract.contractNumber} auto-created`,
        userId,
        { salesContractId },
      );

      // Link specified shipments if provided; otherwise link all existing shipments
      let targetShipmentIds: number[] = [];
      if (initialShipmentIds && initialShipmentIds.length > 0) {
        targetShipmentIds = initialShipmentIds;
      } else {
        const shipments = await this.salesShipmentModel.findAll({
          where: { salesContractId },
          attributes: ['id'],
        });
        targetShipmentIds = shipments.map((s) => s.id);
      }

      for (const sId of targetShipmentIds) {
        await this.shipmentLinkModel.findOrCreate({
          where: { purchaseContractId: pc.id, shipmentId: sId },
          defaults: { purchaseContractId: pc.id, shipmentId: sId } as any,
        });
      }
    }

    return pc;
  }

  /**
   * Create endpoint (supports both SC-linked and Manual MTT creation).
   */
  async create(
    dto: CreatePurchaseContractDto,
    user: any,
  ): Promise<PurchaseContract> {
    return await this.sequelize.transaction(async (t) => {
      let pc: PurchaseContract;

      if (dto.salesContractId) {
        const salesContract = await this.salesContractModel.findOne({
          where: { id: dto.salesContractId, companyId: user?.companyId },
        });
        if (!salesContract)
          throw new NotFoundException(
            'Sales Contract not found or does not belong to company',
          );
        pc = await this.ensureExists(
          dto.salesContractId,
          user?.userId,
          dto.shipmentIds,
        );
      } else {
        await this.validateForeignKeys(user?.companyId, dto);

        // Manual MTT creation flow
        const count = await this.model.count({
          where: { purchaseType: 'MTT' },
        });
        const autoNo = `PC-MTT-${String(count + 1001).padStart(6, '0')}`;
        const contractNumber = dto.contractNumber || autoNo;

        pc = await this.model.create({
          salesContractId: null,
          purchaseType: dto.purchaseType || 'MTT',
          contractNumber,
          buyerId: dto.buyerId || null,
          sellerId: dto.sellerId || null,
          sellerContractNo: dto.sellerContractNo || null,
          paymentTermId: dto.paymentTermId || null,
          paymentTermsText: dto.paymentTermsText || null,
          advancePercent:
            dto.advancePercent != null ? Number(dto.advancePercent) : null,
          balancePercent:
            dto.balancePercent != null ? Number(dto.balancePercent) : null,
          penaltyPercent:
            dto.penaltyPercent != null ? Number(dto.penaltyPercent) : null,
          paymentDueDate: dto.paymentDueDate || null,
          unloadingDate: dto.unloadingDate || null,
          brokerId: dto.brokerId || null,
          brokerCommission: dto.brokerCommission || null,
          deliveryPlace: dto.deliveryPlace || null,
          placeOfLoading: dto.placeOfLoading || null,
          dispatchDate: dto.dispatchDate || null,
          dispatchToDate: dto.dispatchToDate || null,
          quantity: dto.quantity ? String(dto.quantity) : null,
          productQuality: dto.productQuality || null,
          specificationNo: dto.specificationNo || null,
          specificationDate: dto.specificationDate || null,
          notes: dto.notes || null,
          terms: Array.isArray(dto.terms) ? dto.terms : [],
          status: 'Draft',
          createdBy: user?.userId,
          updatedBy: user?.userId,
          companyId: user?.companyId || null,
        });

        await this.activityService.log(
          pc.id,
          PC_ACTIONS.PC_CREATED,
          `Manual MTT Purchase Contract ${contractNumber} created`,
          user?.userId,
        );
      }

      // Handle items if provided
      if (Array.isArray(dto.items) && dto.items.length > 0) {
        await this.itemModel.destroy({ where: { purchaseContractId: pc.id } });
        for (const item of dto.items) {
          await this.itemModel.create({
            purchaseContractId: pc.id,
            productId: item.productId || null,
            productName: item.productName || null,
            quantity: item.quantity != null ? Number(item.quantity) : null,
            productQuality: item.productQuality || null,
            packing: item.packing || null,
            bagType: item.bagType || null,
            bagSpec: item.bagSpec || null,
            stitching: item.stitching || null,
            marking: item.marking || null,
            ratePerMt: item.ratePerMt != null ? Number(item.ratePerMt) : null,
            totalAmount:
              item.totalAmount != null ? Number(item.totalAmount) : null,
          });
        }
      }

      // Handle shipment allocations with partial quantity tracking
      if (
        Array.isArray(dto.shipmentAllocations) &&
        dto.shipmentAllocations.length > 0
      ) {
        await this.shipmentLinkModel.destroy({
          where: { purchaseContractId: pc.id },
        });
        for (const alloc of dto.shipmentAllocations) {
          if (alloc.shipmentId) {
            await this.shipmentLinkModel.create({
              purchaseContractId: pc.id,
              shipmentId: Number(alloc.shipmentId),
              purchaseContractItemId: alloc.purchaseContractItemId
                ? Number(alloc.purchaseContractItemId)
                : null,
              allocatedQuantity:
                alloc.allocatedQuantity != null
                  ? Number(alloc.allocatedQuantity)
                  : null,
            });
          }
        }
      } else if (Array.isArray(dto.shipmentIds) && dto.shipmentIds.length > 0) {
        await this.shipmentLinkModel.destroy({
          where: { purchaseContractId: pc.id },
        });
        for (const shipmentId of dto.shipmentIds) {
          await this.shipmentLinkModel.create({
            purchaseContractId: pc.id,
            shipmentId: Number(shipmentId),
          });
        }
      }

      // Add required documents
      if (
        dto.requiredDocumentTypeIds &&
        dto.requiredDocumentTypeIds.length > 0
      ) {
        for (const tdId of dto.requiredDocumentTypeIds) {
          await this.docModel.findOrCreate({
            where: { purchaseContractId: pc.id, tradeDocumentId: tdId },
            defaults: {
              purchaseContractId: pc.id,
              tradeDocumentId: tdId,
            } as any,
          });
        }
      }

      return pc.reload();
    });
  }

  async findOne(id: number, companyId?: number): Promise<PurchaseContract> {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const pc = await this.model.findOne({
      where,
      include: [
        { model: Partner, as: 'buyer' },
        { model: Partner, as: 'seller' },
        { model: Partner, as: 'broker' },
        { model: PaymentTerm, as: 'paymentTerm' },
        {
          model: PurchaseContractItem,
          as: 'items',
          include: [{ model: Product, as: 'product' }],
        },
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
            { model: Partner, as: 'broker' },
            { model: ShipmentType, as: 'shipmentType' },
            { model: PaymentTerm, as: 'paymentTerm' },
            {
              model: SalesContractItem,
              as: 'items',
              include: [{ model: Product, as: 'product' }],
            },
          ],
        },
      ],
    });
    if (!pc) throw new NotFoundException('Purchase Contract not found');
    return pc;
  }

  async update(
    id: number,
    dto: UpdatePurchaseContractDto,
    user: any,
  ): Promise<PurchaseContract> {
    const pc = await this.findOne(id, user?.companyId);
    await this.validateForeignKeys(user?.companyId, dto);

    const {
      shipmentIds,
      shipmentAllocations,
      items,
      shipmentScheduleData,
      ...updateData
    } = dto;

    const sanitizeData: any = {};
    if (updateData.purchaseType !== undefined)
      sanitizeData.purchaseType = updateData.purchaseType
        ? String(updateData.purchaseType)
        : pc.purchaseType;
    if (updateData.contractNumber !== undefined)
      sanitizeData.contractNumber = updateData.contractNumber
        ? String(updateData.contractNumber)
        : pc.contractNumber;
    if (updateData.buyerId !== undefined)
      sanitizeData.buyerId = updateData.buyerId
        ? Number(updateData.buyerId)
        : null;
    if (updateData.sellerId !== undefined)
      sanitizeData.sellerId = updateData.sellerId
        ? Number(updateData.sellerId)
        : null;
    if (updateData.sellerContractNo !== undefined)
      sanitizeData.sellerContractNo = updateData.sellerContractNo
        ? String(updateData.sellerContractNo)
        : null;
    if (updateData.paymentTermId !== undefined)
      sanitizeData.paymentTermId = updateData.paymentTermId
        ? Number(updateData.paymentTermId)
        : null;
    if (updateData.paymentTermsText !== undefined)
      sanitizeData.paymentTermsText = updateData.paymentTermsText
        ? String(updateData.paymentTermsText)
        : null;
    if (updateData.advancePercent !== undefined)
      sanitizeData.advancePercent =
        updateData.advancePercent != null
          ? Number(updateData.advancePercent)
          : null;
    if (updateData.balancePercent !== undefined)
      sanitizeData.balancePercent =
        updateData.balancePercent != null
          ? Number(updateData.balancePercent)
          : null;
    if (updateData.penaltyPercent !== undefined)
      sanitizeData.penaltyPercent =
        updateData.penaltyPercent != null
          ? Number(updateData.penaltyPercent)
          : null;
    if (updateData.paymentDueDate !== undefined)
      sanitizeData.paymentDueDate = updateData.paymentDueDate
        ? String(updateData.paymentDueDate)
        : null;
    if (updateData.unloadingDate !== undefined)
      sanitizeData.unloadingDate = updateData.unloadingDate
        ? String(updateData.unloadingDate)
        : null;
    if (updateData.brokerId !== undefined)
      sanitizeData.brokerId = updateData.brokerId
        ? Number(updateData.brokerId)
        : null;
    if (updateData.brokerCommission !== undefined)
      sanitizeData.brokerCommission = updateData.brokerCommission
        ? String(updateData.brokerCommission)
        : null;
    if (updateData.dispatchDate !== undefined)
      sanitizeData.dispatchDate = updateData.dispatchDate
        ? String(updateData.dispatchDate)
        : null;
    if (updateData.dispatchToDate !== undefined)
      sanitizeData.dispatchToDate = updateData.dispatchToDate
        ? String(updateData.dispatchToDate)
        : null;
    if (updateData.notes !== undefined)
      sanitizeData.notes = updateData.notes ? String(updateData.notes) : null;
    if (updateData.terms !== undefined)
      sanitizeData.terms = Array.isArray(updateData.terms)
        ? updateData.terms
        : [];
    if (updateData.quantity !== undefined)
      sanitizeData.quantity =
        updateData.quantity != null ? String(updateData.quantity) : null;
    if (updateData.productQuality !== undefined)
      sanitizeData.productQuality = updateData.productQuality
        ? String(updateData.productQuality)
        : null;
    if (updateData.packing !== undefined)
      sanitizeData.packing = updateData.packing
        ? String(updateData.packing)
        : null;
    if (updateData.bagType !== undefined)
      sanitizeData.bagType = updateData.bagType
        ? String(updateData.bagType)
        : null;
    if (updateData.bagSpec !== undefined)
      sanitizeData.bagSpec = updateData.bagSpec
        ? String(updateData.bagSpec)
        : null;
    if (updateData.stitching !== undefined)
      sanitizeData.stitching = updateData.stitching
        ? String(updateData.stitching)
        : null;
    if (updateData.marking !== undefined)
      sanitizeData.marking = updateData.marking
        ? String(updateData.marking)
        : null;
    if (updateData.deliveryPlace !== undefined)
      sanitizeData.deliveryPlace = updateData.deliveryPlace
        ? String(updateData.deliveryPlace)
        : null;
    if (updateData.placeOfLoading !== undefined)
      sanitizeData.placeOfLoading = updateData.placeOfLoading
        ? String(updateData.placeOfLoading)
        : null;
    if (updateData.specificationNo !== undefined)
      sanitizeData.specificationNo = updateData.specificationNo
        ? String(updateData.specificationNo)
        : null;
    if (updateData.specificationDate !== undefined)
      sanitizeData.specificationDate = updateData.specificationDate
        ? String(updateData.specificationDate)
        : null;
    if (updateData.status !== undefined)
      sanitizeData.status = String(updateData.status);

    await pc.update({ ...sanitizeData, updatedBy: user?.userId });

    // Handle items update
    if (Array.isArray(items)) {
      await this.itemModel.destroy({ where: { purchaseContractId: id } });
      for (const item of items) {
        await this.itemModel.create({
          purchaseContractId: id,
          productId: item.productId ? Number(item.productId) : null,
          productName: item.productName || null,
          quantity: item.quantity != null ? Number(item.quantity) : null,
          productQuality: item.productQuality || null,
          packing: item.packing || null,
          bagType: item.bagType || null,
          bagSpec: item.bagSpec || null,
          stitching: item.stitching || null,
          marking: item.marking || null,
          ratePerMt: item.ratePerMt != null ? Number(item.ratePerMt) : null,
          totalAmount:
            item.totalAmount != null ? Number(item.totalAmount) : null,
        });
      }
    }

    // Handle shipment allocations with partial quantities
    if (Array.isArray(shipmentAllocations)) {
      await this.shipmentLinkModel.destroy({
        where: { purchaseContractId: id },
      });
      for (const alloc of shipmentAllocations) {
        if (alloc.shipmentId) {
          await this.shipmentLinkModel.create({
            purchaseContractId: id,
            shipmentId: Number(alloc.shipmentId),
            purchaseContractItemId: alloc.purchaseContractItemId
              ? Number(alloc.purchaseContractItemId)
              : null,
            allocatedQuantity:
              alloc.allocatedQuantity != null
                ? Number(alloc.allocatedQuantity)
                : null,
          });
        }
      }
    } else if (Array.isArray(shipmentIds)) {
      const ids = shipmentIds.map(Number).filter((n) => !isNaN(n));
      await this.shipmentLinkModel.destroy({
        where: {
          purchaseContractId: id,
          shipmentId: { [Op.notIn]: ids.length > 0 ? ids : [-1] },
        },
      });
      for (const sId of ids) {
        await this.shipmentLinkModel.findOrCreate({
          where: { purchaseContractId: id, shipmentId: sId },
          defaults: { purchaseContractId: id, shipmentId: sId } as any,
        });
      }
    }

    if (shipmentScheduleData && typeof shipmentScheduleData === 'object') {
      for (const [shipmentIdStr, data] of Object.entries(
        shipmentScheduleData,
      )) {
        const sId = Number(shipmentIdStr);
        if (!isNaN(sId) && data) {
          const itemData: any = data;
          const sUpdate: any = {};
          if (
            itemData.purchaseRate !== undefined &&
            itemData.purchaseRate !== ''
          )
            sUpdate.purchaseRate = Number(itemData.purchaseRate);
          if (itemData.forex !== undefined && itemData.forex !== '')
            sUpdate.forex = Number(itemData.forex);
          if (itemData.freight !== undefined && itemData.freight !== '')
            sUpdate.freight = Number(itemData.freight);
          if (itemData.remarks !== undefined)
            sUpdate.remarks = itemData.remarks;

          if (Object.keys(sUpdate).length > 0) {
            await this.salesShipmentModel.update(sUpdate, {
              where: { id: sId },
            });
          }
        }
      }
    }

    await this.activityService.log(
      id,
      PC_ACTIONS.PC_UPDATED,
      `Purchase Contract updated`,
      user?.userId,
    );

    return pc.reload();
  }

  async updateStatus(
    id: number,
    dto: UpdatePurchaseContractStatusDto,
    user: any,
  ): Promise<PurchaseContract> {
    const pc = await this.findOne(id, user?.companyId);
    const currentStatus = pc.status;
    const nextStatus = dto.status;

    const allowed = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition: "${currentStatus}" → "${nextStatus}". ` +
          `Allowed transitions: ${allowed.join(', ') || 'none'}`,
      );
    }

    // Guard: Cannot move to Completed unless all linked shipments are Delivered
    if (nextStatus === 'Completed') {
      const links = await this.shipmentLinkModel.findAll({
        where: { purchaseContractId: id },
        include: [
          {
            model: SalesContractShipment,
            as: 'shipment',
            attributes: ['status'],
          },
        ],
      });

      if (links.length === 0) {
        throw new BadRequestException(
          'Cannot complete a Purchase Contract with no linked shipments',
        );
      }

      const notDelivered = links.filter(
        (l) => l.shipment?.status !== 'Delivered',
      );
      if (notDelivered.length > 0) {
        throw new BadRequestException(
          `Cannot complete: ${notDelivered.length} shipment(s) are not yet Delivered`,
        );
      }
    }

    // Guard: At least one shipment needed to move out of Draft
    if (currentStatus === 'Draft' && nextStatus !== 'Cancelled') {
      const count = await this.shipmentLinkModel.count({
        where: { purchaseContractId: id },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Cannot advance a Purchase Contract with no linked shipments',
        );
      }
    }

    await pc.update({ status: nextStatus, updatedBy: user?.userId });

    await this.activityService.log(
      id,
      PC_ACTIONS.STATUS_CHANGED,
      `Status changed: "${currentStatus}" → "${nextStatus}"`,
      user?.userId,
      { from: currentStatus, to: nextStatus },
    );

    return pc.reload();
  }

  async clearDrafts(user: any): Promise<{ count: number }> {
    const where: any = { status: 'Draft' };
    if (user?.companyId) where.companyId = user.companyId;

    const count = await this.model.destroy({ where });
    return { count };
  }

  async remove(id: number, user: any): Promise<{ success: boolean }> {
    const pc = await this.findOne(id, user?.companyId);
    if (!['Draft', 'Cancelled'].includes(pc.status)) {
      throw new BadRequestException(
        'Only Draft or Cancelled Purchase Contracts can be deleted',
      );
    }
    await pc.update({ status: 'Cancelled', updatedBy: user?.userId });
    return { success: true };
  }
}
