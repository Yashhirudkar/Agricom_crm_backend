import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PurchaseContract } from '../models/purchase-contract.model';
import { PurchaseContractItem } from '../models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { Partner } from '../../masters/partner/partner.model';
import { PartnerRole } from '../../masters/partner-role/partner-role.model';
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
import { BusinessTransactionService } from '../../system/services/business-transaction.service';

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
    private readonly businessTransactionService: BusinessTransactionService,
  ) {}

  private async validateForeignKeys(
    companyId: number,
    dto: any,
    contractType = 'MTT',
  ) {
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

      const requiredRoleName =
        String(contractType).toLowerCase() === 'export'
          ? 'DOMESTIC BROKER'
          : 'INTERNATIONAL BROKER';
      const requiredRole = await PartnerRole.findOne({
        where: { name: { [Op.iLike]: requiredRoleName } },
      });
      if (!requiredRole)
        throw new BadRequestException(
          `Required broker role "${requiredRoleName}" is not configured`,
        );
      if (broker.partnerRoleId !== requiredRole.id)
        throw new BadRequestException(
          `Broker must have the "${requiredRoleName}" role for ${contractType} contracts`,
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
    if (dto.shipmentTypeId) {
      const shipmentType = await ShipmentType.findOne({
        where: { id: dto.shipmentTypeId, companyId },
      });
      if (!shipmentType)
        throw new BadRequestException(
          'Shipment Type not found or does not belong to company',
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
          attributes: [
            'id',
            'contractNumber',
            'companyId',
            'sellerId',
            'businessTransactionId',
          ],
        },
      );
      if (!salesContract)
        throw new NotFoundException('Sales Contract not found');

      pc = await this.model.create({
        salesContractId,
        businessTransactionId: salesContract.businessTransactionId ?? null,
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
    const createdPc = await this.sequelize.transaction(async (t) => {
      let pc: PurchaseContract;

      if (dto.salesContractId) {
        const salesContract = await this.salesContractModel.findOne({
          where: { id: dto.salesContractId, companyId: user?.companyId },
        });
        if (!salesContract)
          throw new NotFoundException(
            'Sales Contract not found or does not belong to company',
          );
        await this.validateForeignKeys(
          user?.companyId,
          {
            brokerId:
              dto.brokerId === undefined
                ? salesContract.brokerId
                : dto.brokerId,
            shipmentTypeId: dto.shipmentTypeId,
          },
          salesContract.contractType || 'Import',
        );
        pc = await this.ensureExists(
          dto.salesContractId,
          user?.userId,
          dto.shipmentIds,
        );
      } else {
        await this.validateForeignKeys(
          user?.companyId,
          dto,
          dto.purchaseType || 'MTT',
        );

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
          purchaseDate: dto.purchaseDate || null,
          paymentTermId: dto.paymentTermId || null,
          shipmentTypeId: dto.shipmentTypeId || null,
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
          freightRequired: dto.freightRequired != null ? Boolean(dto.freightRequired) : false,
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

      const scUpdates: any = {};
      if (dto.salesContractId && dto.shipmentTypeId !== undefined) {
        scUpdates.shipmentTypeId = dto.shipmentTypeId || null;
      }
      if (dto.freightRequired !== undefined) {
        scUpdates.freightRequired = Boolean(dto.freightRequired);
      }
      if (Object.keys(scUpdates).length > 0) {
        await pc.update(scUpdates, { transaction: t });
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

      if (dto.purchaseDate !== undefined) {
        await pc.update({ purchaseDate: dto.purchaseDate || null });
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

      await this.businessTransactionService.ensureForPurchaseContract(
        pc.id,
        user?.userId,
        t,
      );
      return pc.reload();
    });

    if (
      createdPc.status !== 'Draft' &&
      createdPc.status !== 'Cancelled' &&
      createdPc.freightRequired
    ) {
      await this.syncTransportQueue(createdPc, user);
    }
    return createdPc;
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
        { model: ShipmentType, as: 'shipmentType' },
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
    const contractType =
      String(dto.purchaseType ?? pc.purchaseType).toLowerCase() === 'mtt'
        ? 'MTT'
        : pc.salesContract?.contractType || 'Import';
    await this.validateForeignKeys(
      user?.companyId,
      dto.brokerId === undefined ? { ...dto, brokerId: pc.brokerId } : dto,
      contractType,
    );

    const {
      shipmentIds,
      shipmentAllocations,
      items,
      shipmentScheduleData,
      ...updateData
    } = dto;

    const sanitizeData: any = {};
    const requestedStatus = updateData.status;
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
    if (updateData.purchaseDate !== undefined)
      sanitizeData.purchaseDate = updateData.purchaseDate
        ? String(updateData.purchaseDate)
        : null;
    if (updateData.paymentTermId !== undefined)
      sanitizeData.paymentTermId = updateData.paymentTermId
        ? Number(updateData.paymentTermId)
        : null;
    if (updateData.shipmentTypeId !== undefined)
      sanitizeData.shipmentTypeId = updateData.shipmentTypeId
        ? Number(updateData.shipmentTypeId)
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
    if (updateData.freightRequired !== undefined) {
      sanitizeData.freightRequired = Boolean(updateData.freightRequired);
    }
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

    if (requestedStatus !== undefined) {
      const nextStatus = String(requestedStatus);
      await this.sequelize.transaction(async (transaction) => {
        if (pc.salesContractId) {
          await this.businessTransactionService.ensureForSalesContract(
            pc.salesContractId,
            user?.userId,
            transaction,
          );
        }
        await pc.update(
          { status: nextStatus, updatedBy: user?.userId },
          { transaction },
        );
        if (!pc.salesContractId) {
          await this.businessTransactionService.ensureForPurchaseContract(
            id,
            user?.userId,
            transaction,
          );
        }
      });
    } else {
      await this.businessTransactionService.ensureForPurchaseContract(
        id,
        user?.userId,
      );
    }
    await this.activityService.log(
      id,
      PC_ACTIONS.PC_UPDATED,
      `Purchase Contract updated`,
      user?.userId,
    );
    const updatedPc = await pc.reload();
    if (
      updatedPc.status !== 'Draft' &&
      updatedPc.status !== 'Cancelled' &&
      updatedPc.freightRequired
    ) {
      await this.syncTransportQueue(updatedPc, user);
    }
    return updatedPc;
  }

  private async syncTransportQueue(pc: PurchaseContract, user: any) {
    try {
      if (
        !pc ||
        pc.status === 'Draft' ||
        pc.status === 'Cancelled' ||
        !pc.freightRequired
      ) {
        return;
      }

      const LogisticsModel = this.sequelize.models.Logistics as any;
      const EnquiryModel = this.sequelize.models.Enquiry as any;
      const LogisticsRouteModel = this.sequelize.models.LogisticsRoute as any;

      if (!LogisticsModel || !EnquiryModel) return;

      let enquiryId: string | null = null;
      let enquiry: any = null;

      if (pc.salesContractId) {
        const sc = await this.salesContractModel.findByPk(pc.salesContractId, {
          attributes: ['id', 'enquiryId', 'businessTransactionId'],
        });
        if (sc?.enquiryId) {
          enquiryId = sc.enquiryId;
        }
      }

      if (!enquiryId && pc.businessTransactionId) {
        const enq = await EnquiryModel.findOne({
          where: {
            businessTransactionId: pc.businessTransactionId,
            ...(pc.companyId ? { companyId: pc.companyId } : {}),
          },
          attributes: [
            'id',
            'businessTransactionId',
            'shipmentMode',
            'originCountryId',
            'destinationCountry',
          ],
        });
        if (enq) {
          enquiryId = enq.id;
          enquiry = enq;
        }
      } else if (enquiryId) {
        enquiry = await EnquiryModel.findByPk(enquiryId, {
          attributes: [
            'id',
            'businessTransactionId',
            'shipmentMode',
            'originCountryId',
            'destinationCountry',
          ],
        });
      }

      // If standalone MTT or no existing enquiry, ensure an enquiry record exists for Transport Management
      if (!enquiryId) {
        const count = await EnquiryModel.count({
          where: { companyId: pc.companyId || 1 },
        });
        const enquiryNo = `ENQ-PC-${String(count + 1001).padStart(6, '0')}`;
        const firstItem = await this.itemModel.findOne({
          where: { purchaseContractId: pc.id },
          order: [['id', 'ASC']],
        });
        const partner = await Partner.findByPk(pc.buyerId || pc.sellerId);
        const newEnq = await EnquiryModel.create({
          enquiryNo,
          enquiryDate: pc.purchaseDate || new Date(),
          companyId: pc.companyId || 1,
          partnerRoleId: partner?.partnerRoleId || 11,
          partnerId: pc.buyerId || pc.sellerId || 1,
          productId: firstItem?.productId || 1,
          quantity: pc.quantity
            ? Number(pc.quantity)
            : firstItem?.quantity
              ? Number(firstItem.quantity)
              : 1,
          businessTransactionId: null,
          status: 'CONFIRMED',
          freightRequired: true,
        });
        enquiryId = newEnq.id;
        enquiry = newEnq;
      }

      // Prevent duplicate records for the same Purchase Contract
      let logistics = await LogisticsModel.findOne({
        where: {
          [Op.or]: [
            { purchaseContractId: pc.id },
            ...(enquiryId ? [{ enquiryId }] : []),
          ],
          ...(pc.companyId ? { companyId: pc.companyId } : {}),
        },
      });

      if (logistics) {
        // Update existing queue record with the latest Purchase Contract values
        await logistics.update({
          purchaseContractId: pc.id,
          businessTransactionId:
            pc.businessTransactionId ||
            enquiry?.businessTransactionId ||
            logistics.businessTransactionId,
          updatedBy: user?.userId,
        });

        // Synchronize Route
        if (LogisticsRouteModel) {
          const routes = await LogisticsRouteModel.findAll({
            where: { logisticsId: logistics.id },
          });
          if (routes && routes.length > 0) {
            await LogisticsRouteModel.update(
              {
                origin: pc.placeOfLoading || undefined,
                destination: pc.deliveryPlace || undefined,
              },
              { where: { logisticsId: logistics.id } },
            );
          } else if (pc.placeOfLoading || pc.deliveryPlace) {
            await LogisticsRouteModel.create({
              logisticsId: logistics.id,
              origin: pc.placeOfLoading || '—',
              destination: pc.deliveryPlace || '—',
            });
          }
        }
      } else {
        // Automatically create a new Transport Management queue record on Save & Activate
        await this.sequelize.query(
          `CREATE SEQUENCE IF NOT EXISTS logistics_no_seq START 1;`,
        );
        const [seqRes]: any = await this.sequelize.query(
          `SELECT nextval('logistics_no_seq')`,
          { type: QueryTypes.SELECT } as any,
        );
        const nextVal = parseInt(
          seqRes?.nextval ?? seqRes?.[0]?.nextval ?? '1',
          10,
        );
        const currentYear = new Date().getFullYear();
        const logisticsNumber = `LOG/${currentYear}/${String(nextVal).padStart(6, '0')}`;

        const mode =
          enquiry?.shipmentMode === 'SHIP' ? 'International' : 'Domestic';
        let transportMode = 'Road';
        if (enquiry?.shipmentMode === 'SHIP') transportMode = 'Sea';
        else if (enquiry?.shipmentMode === 'RAIL') transportMode = 'Rail';

        logistics = await LogisticsModel.create({
          logisticsNumber,
          enquiryId,
          purchaseContractId: pc.id,
          businessTransactionId:
            pc.businessTransactionId ||
            enquiry?.businessTransactionId ||
            null,
          companyId: pc.companyId || user?.companyId,
          mode,
          transportMode,
          status: 'Pending',
          isViewed: false,
          createdBy: user?.userId,
          updatedBy: user?.userId,
        });

        if (LogisticsRouteModel) {
          await LogisticsRouteModel.create({
            logisticsId: logistics.id,
            origin: pc.placeOfLoading || '—',
            destination: pc.deliveryPlace || '—',
          });
        }
      }
    } catch (err) {
      console.error(
        'Failed to sync transport queue for purchase contract:',
        err,
      );
    }
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
      const standaloneMtt =
        pc.purchaseType === 'MTT' && pc.salesContractId == null;
      if (count === 0 && !standaloneMtt) {
        throw new BadRequestException(
          'Cannot advance a Purchase Contract with no linked shipments',
        );
      }
    }

    await this.sequelize.transaction(async (transaction) => {
      if (pc.salesContractId) {
        await this.businessTransactionService.ensureForSalesContract(
          pc.salesContractId,
          user?.userId,
          transaction,
        );
      }
      await pc.update(
        { status: nextStatus, updatedBy: user?.userId },
        { transaction },
      );
      if (!pc.salesContractId) {
        await this.businessTransactionService.ensureForPurchaseContract(
          id,
          user?.userId,
          transaction,
        );
      }
    });

    await this.activityService.log(
      id,
      PC_ACTIONS.STATUS_CHANGED,
      `Status changed: "${currentStatus}" → "${nextStatus}"`,
      user?.userId,
      { from: currentStatus, to: nextStatus },
    );

    const reloadedPc = await pc.reload();
    if (
      nextStatus !== 'Draft' &&
      nextStatus !== 'Cancelled' &&
      reloadedPc.freightRequired
    ) {
      await this.syncTransportQueue(reloadedPc, user);
    }
    return reloadedPc;
  }

  async clearDrafts(user: any): Promise<{ count: number }> {
    const where: any = { status: 'Draft' };
    if (user?.companyId) where.companyId = user.companyId;

    where.businessTransactionId = null;
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
