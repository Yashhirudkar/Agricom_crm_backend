import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContract } from '../models/purchase-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { Partner } from '../../masters/partner/partner.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { Product } from '../../masters/product/product.model';
import { AddShipmentDto } from '../dto/add-shipment.dto';
import {
  PurchaseContractActivityService,
  PC_ACTIONS,
} from './purchase-contract-activity.service';

@Injectable()
export class PurchaseContractShipmentService {
  constructor(
    @InjectModel(PurchaseContractShipment)
    private readonly linkModel: typeof PurchaseContractShipment,
    @InjectModel(PurchaseContract)
    private readonly contractModel: typeof PurchaseContract,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    private readonly activityService: PurchaseContractActivityService,
  ) {}

  /**
   * Syncs the exact array of selected shipment IDs for a Purchase Contract.
   * Removes unselected shipments and adds newly selected ones.
   */
  async syncShipmentSelection(
    purchaseContractId: number,
    shipmentIds: number[],
    user?: any,
  ) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');

    if (contract.salesContractId) {
      // SC-linked links are rebuilt by PurchaseContractService from the
      // persisted Purchase Quantity; ignore arbitrary client selections.
      return this.getShipments(purchaseContractId);
    }

    const ids = Array.isArray(shipmentIds) ? shipmentIds.map(Number) : [];

    // Delete links not in selected shipmentIds
    await this.linkModel.destroy({
      where: {
        purchaseContractId,
        shipmentId: { [Op.notIn]: ids.length > 0 ? ids : [-1] },
      },
    });

    // Create links for selected shipmentIds & sync origin
    for (const sId of ids) {
      await this.linkModel.findOrCreate({
        where: { purchaseContractId, shipmentId: sId },
        defaults: { purchaseContractId, shipmentId: sId } as any,
      });
      if (contract.placeOfLoading) {
        await this.shipmentModel.update(
          { origin: contract.placeOfLoading },
          { where: { id: sId } },
        );
      }
    }

    await this.activityService.log(
      purchaseContractId,
      PC_ACTIONS.PC_UPDATED,
      `Updated shipment selection (${ids.length} shipments selected)`,
      user?.userId,
      { shipmentIds: ids },
    );

    return this.getShipments(purchaseContractId);
  }

  /**
   * Returns all shipments linked to a Purchase Contract with LIVE data from SalesContractShipment.
   * No snapshots. Single join query — no N+1.
   */
  async getShipments(purchaseContractId: number) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');

    // Load shipment links (read-only — no DB mutation here).
    // For SC-linked PCs the canonical links are built by the service layer
    // whenever a PC is created or its quantity changes.
    const links = await this.linkModel.findAll({
      where: { purchaseContractId },
      include: [
        {
          model: SalesContractShipment,
          as: 'shipment',
          include: [
            {
              model: SalesContract,
              as: 'salesContract',
              attributes: ['id', 'contractNumber', 'buyerId', 'currencyCode'],
              include: [
                {
                  model: Partner,
                  as: 'buyer',
                  attributes: ['id', 'entityName'],
                },
                {
                  model: SalesContractItem,
                  as: 'items',
                  include: [
                    {
                      model: Product,
                      as: 'product',
                      attributes: ['id', 'name'],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    // For SC-linked PCs: sort links by shipment sequence for consistent display.
    // Show ALL stored links — the rebuild engine already ensures correctness.
    let visibleLinks = links;
    if (contract.salesContractId) {
      visibleLinks = [...links].sort(
        (a, b) =>
          (Number(a.shipment?.shipmentSequence) || 0) -
            (Number(b.shipment?.shipmentSequence) || 0) ||
          (Number(a.shipment?.shipmentNo) || 0) -
            (Number(b.shipment?.shipmentNo) || 0) ||
          a.id - b.id,
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return visibleLinks.map((link) => {
      const s = link.shipment;
      const sc: any = s.salesContract || {};
      const sourceShipmentQuantity = Number(s.quantity) || 0;
      const scheduleQuantity =
        !contract.salesContractId && link.allocatedQuantity != null
          ? Number(link.allocatedQuantity)
          : sourceShipmentQuantity;

      // Auto Route Source Mapping
      const origin = contract.placeOfLoading || s.origin || '—';
      const destination =
        sc.destinationLocationName ||
        sc.portOfDischarge ||
        sc.deliveryPlace ||
        s.destination ||
        '—';
      const commodity =
        (contract as any).items?.[0]?.productName ||
        (contract as any).items?.[0]?.product?.name ||
        sc.items?.[0]?.product?.name ||
        '—';
      const supplier = (contract as any).seller?.entityName || '—';
      const buyer = sc.buyer?.entityName || '—';

      const json: any = {
        linkId: link.id,
        shipmentId: s.id,
        shipmentNo: s.shipmentNo,
        shipmentReference: s.shipmentReference,
        shipmentDate: s.shipmentDate,
        quantity: scheduleQuantity,
        sourceQuantity: sourceShipmentQuantity,
        noOfContainers: s.noOfContainers,
        purchaseRate: s.purchaseRate,
        ratePerMt: s.ratePerMt,
        freight: s.freight,
        forex: s.forex,
        status: s.status,
        remarks: s.remarks,
        origin,
        destination,
        route: `${origin} → ${destination}`,
        commodity,
        supplier,
        buyer,
        salesContract: s.salesContract,
        timeline: this.computeTimeline(s.shipmentDate, s.status),
        linkedAt: link.createdAt,
      };
      return json;
    });
  }

  private computeTimeline(shipmentDateRaw: Date | string, status: string) {
    if (status === 'Delivered') {
      return { label: 'Delivered', color: 'black', days: 0, type: 'completed' };
    }
    if (status === 'Cancelled') {
      return { label: 'Cancelled', color: 'gray', days: 0, type: 'cancelled' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(shipmentDateRaw);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diff === 0)
      return { label: 'Today', color: 'green', days: 0, type: 'today' };
    if (diff === 1)
      return { label: 'Tomorrow', color: 'blue', days: 1, type: 'tomorrow' };
    if (diff > 1)
      return {
        label: `In ${diff} Days`,
        color: diff <= 7 ? 'blue' : 'orange',
        days: diff,
        type: 'upcoming',
      };
    return {
      label: `Overdue ${Math.abs(diff)} Days`,
      color: 'red',
      days: diff,
      type: 'overdue',
    };
  }

  async addShipment(
    purchaseContractId: number,
    dto: AddShipmentDto,
    user: any,
  ) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');
    if (contract.salesContractId) {
      throw new ConflictException(
        'Sales Contract-linked shipments are allocated automatically from Purchase Quantity',
      );
    }

    const shipment = await this.shipmentModel.findByPk(dto.shipmentId, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          attributes: ['id', 'contractNumber'],
        },
      ],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // Verify the shipment belongs to the same Sales Contract
    if (shipment.salesContractId !== contract.salesContractId) {
      throw new ConflictException(
        'Shipment does not belong to the Sales Contract linked to this Purchase Contract',
      );
    }

    const existing = await this.linkModel.findOne({
      where: { purchaseContractId, shipmentId: dto.shipmentId },
    });
    if (existing) {
      throw new ConflictException(
        `Shipment #${shipment.shipmentNo} is already linked to this Purchase Contract`,
      );
    }

    const link = await this.linkModel.create({
      purchaseContractId,
      shipmentId: dto.shipmentId,
    });

    if (contract.placeOfLoading) {
      await this.shipmentModel.update(
        { origin: contract.placeOfLoading },
        { where: { id: dto.shipmentId } },
      );
    }

    await this.activityService.log(
      purchaseContractId,
      PC_ACTIONS.SHIPMENT_ADDED,
      `Shipment ${shipment.shipmentReference || '#' + shipment.shipmentNo} added`,
      user?.userId,
      { shipmentId: dto.shipmentId },
    );

    return link;
  }

  async removeShipment(
    purchaseContractId: number,
    shipmentId: number,
    user: any,
  ) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');
    if (contract.salesContractId) {
      throw new ConflictException(
        'Sales Contract-linked shipments are allocated automatically from Purchase Quantity',
      );
    }

    const link = await this.linkModel.findOne({
      where: { purchaseContractId, shipmentId },
    });
    if (!link) throw new NotFoundException('Shipment link not found');

    const shipment = await this.shipmentModel.findByPk(shipmentId, {
      attributes: ['id', 'shipmentNo', 'shipmentReference'],
    });

    await link.destroy();

    await this.activityService.log(
      purchaseContractId,
      PC_ACTIONS.SHIPMENT_REMOVED,
      `Shipment ${shipment?.shipmentReference || '#' + shipmentId} removed`,
      user?.userId,
      { shipmentId },
    );

    return { success: true };
  }
}
