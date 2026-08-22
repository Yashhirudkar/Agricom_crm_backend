import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PurchaseContract } from '../models/purchase-contract.model';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { CreatePurchaseContractDto } from '../dto/create-purchase-contract.dto';
import { UpdatePurchaseContractDto, UpdatePurchaseContractStatusDto } from '../dto/update-purchase-contract.dto';
import { PurchaseContractActivityService, PC_ACTIONS } from './purchase-contract-activity.service';

// Status transition rules
const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ['In Progress', 'Cancelled'],
  'In Progress': ['Awaiting Documents', 'Ready for Dispatch', 'Cancelled'],
  'Awaiting Documents': ['In Progress', 'Ready for Dispatch', 'Cancelled'],
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

  /**
   * Auto-create flow: Called by ShipmentService after first shipment save.
   * Idempotent — if PC already exists for this sales contract, returns it.
   */
  async ensureExists(salesContractId: number, userId?: number): Promise<PurchaseContract> {
    let pc = await this.model.findOne({ where: { salesContractId } });

    if (!pc) {
      const salesContract = await this.salesContractModel.findByPk(salesContractId, {
        attributes: ['id', 'contractNumber'],
      });
      if (!salesContract) throw new NotFoundException('Sales Contract not found');

      pc = await this.model.create({
        salesContractId,
        status: 'Draft',
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      } as any);

      await this.activityService.log(
        pc.id,
        PC_ACTIONS.PC_CREATED,
        `Purchase Contract PC-${salesContract.contractNumber} auto-created`,
        userId,
        { salesContractId },
      );

      // Auto-link all existing shipments belonging to this salesContractId
      const shipments = await this.salesShipmentModel.findAll({
        where: { salesContractId },
        attributes: ['id'],
      });

      for (const s of shipments) {
        await this.shipmentLinkModel.findOrCreate({
          where: { purchaseContractId: pc.id, shipmentId: s.id },
          defaults: { purchaseContractId: pc.id, shipmentId: s.id } as any,
        });
      }
    }

    return pc;
  }

  /**
   * Manual creation endpoint (kept for explicit creation from frontend, e.g. Rocket button).
   * Calls ensureExists internally.
   */
  async create(dto: CreatePurchaseContractDto, user: any): Promise<PurchaseContract> {
    const salesContract = await this.salesContractModel.findByPk(dto.salesContractId);
    if (!salesContract) throw new NotFoundException('Sales Contract not found');

    return await this.sequelize.transaction(async (t) => {
      const pc = await this.ensureExists(dto.salesContractId, user?.userId);



      // Link shipments
      if (dto.shipmentIds && dto.shipmentIds.length > 0) {
        for (const shipmentId of dto.shipmentIds) {
          await this.shipmentLinkModel.findOrCreate({
            where: { purchaseContractId: pc.id, shipmentId },
            defaults: { purchaseContractId: pc.id, shipmentId } as any,
          });
        }
      }

      // Add required documents
      if (dto.requiredDocumentTypeIds && dto.requiredDocumentTypeIds.length > 0) {
        for (const tdId of dto.requiredDocumentTypeIds) {
          await this.docModel.findOrCreate({
            where: { purchaseContractId: pc.id, tradeDocumentId: tdId },
            defaults: { purchaseContractId: pc.id, tradeDocumentId: tdId } as any,
          });
        }
      }

      return pc.reload();
    });
  }

  async findOne(id: number): Promise<PurchaseContract> {
    const pc = await this.model.findByPk(id, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
            { model: Partner, as: 'broker' },
            { model: ShipmentType, as: 'shipmentType' },
            { model: PaymentTerm, as: 'paymentTerm' },
          ],
        },
      ],
    });
    if (!pc) throw new NotFoundException('Purchase Contract not found');
    return pc;
  }

  async update(id: number, dto: UpdatePurchaseContractDto, user: any): Promise<PurchaseContract> {
    const pc = await this.findOne(id);
    const { shipmentIds, shipmentScheduleData, ...updateData } = dto;

    const sanitizeData: any = {};
    if (updateData.purchaseType !== undefined) sanitizeData.purchaseType = updateData.purchaseType ? String(updateData.purchaseType) : null;
    if (updateData.sellerContractNo !== undefined) sanitizeData.sellerContractNo = updateData.sellerContractNo ? String(updateData.sellerContractNo) : null;
    if (updateData.notes !== undefined) sanitizeData.notes = updateData.notes ? String(updateData.notes) : null;
    if (updateData.terms !== undefined) sanitizeData.terms = Array.isArray(updateData.terms) ? updateData.terms : [];
    if (updateData.quantity !== undefined) sanitizeData.quantity = updateData.quantity != null ? String(updateData.quantity) : null;
    if (updateData.productQuality !== undefined) sanitizeData.productQuality = updateData.productQuality ? String(updateData.productQuality) : null;
    if (updateData.packing !== undefined) sanitizeData.packing = updateData.packing ? String(updateData.packing) : null;
    if (updateData.bagType !== undefined) sanitizeData.bagType = updateData.bagType ? String(updateData.bagType) : null;
    if (updateData.bagSpec !== undefined) sanitizeData.bagSpec = updateData.bagSpec ? String(updateData.bagSpec) : null;
    if (updateData.stitching !== undefined) sanitizeData.stitching = updateData.stitching ? String(updateData.stitching) : null;
    if (updateData.marking !== undefined) sanitizeData.marking = updateData.marking ? String(updateData.marking) : null;
    if (updateData.incoterm !== undefined) sanitizeData.incoterm = updateData.incoterm ? String(updateData.incoterm) : null;
    if (updateData.deliveryPlace !== undefined) sanitizeData.deliveryPlace = updateData.deliveryPlace ? String(updateData.deliveryPlace) : null;
    if (updateData.status !== undefined) sanitizeData.status = String(updateData.status);

    await pc.update({ ...sanitizeData, updatedBy: user?.userId });

    if (Array.isArray(shipmentIds)) {
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
      for (const [shipmentIdStr, data] of Object.entries(shipmentScheduleData)) {
        const sId = Number(shipmentIdStr);
        if (!isNaN(sId) && data) {
          const itemData: any = data;
          const sUpdate: any = {};
          if (itemData.purchaseRate !== undefined && itemData.purchaseRate !== '') sUpdate.purchaseRate = Number(itemData.purchaseRate);
          if (itemData.forex !== undefined && itemData.forex !== '') sUpdate.forex = Number(itemData.forex);
          if (itemData.freight !== undefined && itemData.freight !== '') sUpdate.freight = Number(itemData.freight);
          if (itemData.remarks !== undefined) sUpdate.remarks = itemData.remarks;

          if (Object.keys(sUpdate).length > 0) {
            await this.salesShipmentModel.update(sUpdate, { where: { id: sId } });
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

  async updateStatus(id: number, dto: UpdatePurchaseContractStatusDto, user: any): Promise<PurchaseContract> {
    const pc = await this.findOne(id);
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
        include: [{ model: SalesContractShipment, as: 'shipment', attributes: ['status'] }],
      });

      if (links.length === 0) {
        throw new BadRequestException('Cannot complete a Purchase Contract with no linked shipments');
      }

      const notDelivered = links.filter((l) => l.shipment?.status !== 'Delivered');
      if (notDelivered.length > 0) {
        throw new BadRequestException(
          `Cannot complete: ${notDelivered.length} shipment(s) are not yet Delivered`,
        );
      }
    }

    // Guard: At least one shipment needed to move out of Draft
    if (currentStatus === 'Draft' && nextStatus !== 'Cancelled') {
      const count = await this.shipmentLinkModel.count({ where: { purchaseContractId: id } });
      if (count === 0) {
        throw new BadRequestException('Cannot advance a Purchase Contract with no linked shipments');
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

  async remove(id: number, user: any): Promise<{ success: boolean }> {
    const pc = await this.findOne(id);
    if (!['Draft', 'Cancelled'].includes(pc.status)) {
      throw new BadRequestException('Only Draft or Cancelled Purchase Contracts can be deleted');
    }
    await pc.update({ status: 'Cancelled', updatedBy: user?.userId });
    return { success: true };
  }
}
