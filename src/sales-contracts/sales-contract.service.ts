import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Order, QueryTypes } from 'sequelize';
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
import { PurchaseContract } from '../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractItem } from '../purchase-contracts/models/purchase-contract-item.model';
import { Enquiry } from '../enquiries/models/enquiry.model';
import { TransportDetail } from '../enquiries/models/transport-detail.model';
import { LogisticsService } from '../logistics/services/logistics.service';
import { PartnerRole } from '../masters/partner-role/partner-role.model';

import { TradeDocument } from '../masters/trade-document/trade-document.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { evaluateFreightRequired } from '../masters/shipment-type/freight-rule-engine.service';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../masters/bag-specs/models/bag-specification.model';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import {
  UpdateSalesContractDto,
  UpdateSalesContractStatusDto,
} from './dto/update-sales-contract.dto';
import { QuerySalesContractDto } from './dto/query-sales-contract.dto';
import { generateShipmentReference } from './utils/shipment-reference.util';
import {
  generateQuantityDescription,
  getContractItemQuantityDescription,
  getContractTransportMode,
} from './utils/quantity-description.util';
import {
  distributeShipmentQuantities,
  isDivisible,
} from './utils/shipment-distribution.util';
import { BusinessTransactionService } from '../system/services/business-transaction.service';
import {
  isBusinessReferenceSearch,
  resolveBusinessTransactionId,
} from '../system/utils/business-reference-query.util';
import { BusinessTransaction } from '../system/models/business-transaction.model';
import {
  getAutoContractConfig,
  generateNextContractNumber,
  getFySuffix,
  parseSequenceFromContractNumber,
  buildContractPrefix,
} from './utils/contract-number.util';
import { NotificationsGateway } from '../notifications/gateways/notifications.gateway';

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
    @InjectModel(TransportDetail)
    private readonly transportDetailModel: typeof TransportDetail,
    private readonly attachmentsService: AttachmentsService,
    private readonly sequelize: Sequelize,
    private readonly businessTransactionService: BusinessTransactionService,
    @Optional()
    private readonly notificationsGateway?: NotificationsGateway,
    @Optional()
    @Inject(forwardRef(() => LogisticsService))
    private readonly logisticsService?: LogisticsService,
  ) {}

  async onModuleInit() {
    // Schema modifications are handled by database migrations (phase-06-sales & phase-07-shipments)
  }

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
    if (dto.shipmentTypeId) {
      const st = await ShipmentType.findOne({
        where: { id: dto.shipmentTypeId, companyId },
      });
      if (!st)
        throw new BadRequestException(
          'Shipment Type not found or does not belong to company',
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

    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        if (item.productId) {
          const prod = await Product.findOne({
            where: { id: item.productId, companyId },
          });
          if (!prod)
            throw new BadRequestException(
              'Product not found or does not belong to company',
            );
        }
        if (item.bagTypeId) {
          const bagType = await BagType.findOne({
            where: { id: item.bagTypeId, companyId },
          });
          if (!bagType)
            throw new BadRequestException(
              'Bag Type not found or does not belong to company',
            );
        }
        if (item.packingTypeId) {
          const pack = await PackingType.findOne({
            where: { id: item.packingTypeId, companyId },
          });
          if (!pack)
            throw new BadRequestException(
              'Packing Type not found or does not belong to company',
            );
        }
        if (item.bagSpecificationId) {
          const spec = await BagSpecification.findOne({
            where: { id: item.bagSpecificationId, companyId },
          });
          if (!spec)
            throw new BadRequestException(
              'Bag Specification not found or does not belong to company',
            );
        }
      }
    }
  }

  async create(dto: CreateSalesContractDto, user: any): Promise<SalesContract> {
    const companyId: number = user?.companyId;

    // ── Step 1: Determine if this is an Agricom auto-number seller ──────────
    let resolvedContractNumber: string = dto.contractNumber?.trim() || '';
    let isAutoGenerated = false;

    if (dto.enquiryId && dto.sellerId) {
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

    if (dto.enquiryId) {
      const eq = await Enquiry.findByPk(dto.enquiryId, {
        attributes: ['id', 'partnerId', 'brokerId'],
      });
      if (!eq) {
        throw new BadRequestException('Enquiry not found.');
      }

      // A confirmed order's Partner is the buyer. Resolve the sales-contract
      // buyer from the enquiry itself instead of trusting a stale/incorrect
      // buyerId from the conversion request.
      if (!eq.partnerId) {
        throw new BadRequestException(
          'The confirmed order does not have a buyer partner.',
        );
      }
      dto.buyerId = eq.partnerId;

      if (!dto.brokerId && eq.brokerId) {
        dto.brokerId = eq.brokerId;
      }
    }

    await this.validateForeignKeys(companyId, dto);

    const createdContract = await this.sequelize.transaction(async (t) => {
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
      const isRailFreight = getContractTransportMode(dto) === 'RAIL';
      let calculatedTotalQty = 0;
      let calculatedTotalAmt = 0;
      if (dto.items && dto.items.length > 0) {
        dto.items.forEach((item) => {
          if (isRailFreight) {
            // Skip exact multiple validation for Rail Freight / Wagon
          } else if (
            item.qtyPerCount != null &&
            Number(item.qtyPerCount) > 0 &&
            item.quantity != null &&
            Number(item.quantity) > 0 &&
            !isDivisible(item.quantity, item.qtyPerCount)
          ) {
            throw new BadRequestException(
              `Product Quantity (${item.quantity} MT) is not divisible by Qty Per Count (${item.qtyPerCount} MT). Product Quantity must be an exact multiple of Qty Per Count.`,
            );
          }
          item.amount = parseFloat((item.quantity * item.unitPrice).toFixed(2));
          calculatedTotalQty += item.quantity;
          calculatedTotalAmt += item.amount;
        });
      }

      // 2. Create Header
      if (dto.transportDetails && Array.isArray(dto.transportDetails)) {
        for (const [idx, item] of dto.transportDetails.entries()) {
          if (
            !item.origin?.trim() ||
            !item.incoterm?.trim() ||
            !item.destination?.trim()
          ) {
            throw new BadRequestException(
              `Transport Details row ${idx + 1} must contain Place of Loading (POL), Incoterm, and Destination.`,
            );
          }
        }
      }

      let resolvedDestinationLocationName = dto.destinationLocationName || null;
      let st: any = null;
      if (dto.shipmentTypeId) {
        st = await ShipmentType.findOne({
          where: { id: dto.shipmentTypeId, companyId },
        });
        if (st && st.salesContractDeliveryPlaceRequired === false) {
          resolvedDestinationLocationName = null;
        }
      }

      const contract = await this.model.create(
        {
          ...dto,
          destinationLocationName: resolvedDestinationLocationName,
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
        const mode =
          contract.transportMode ||
          contract.originTransportMode ||
          contract.destinationTransportMode ||
          'sea';
        const contractContainerType = contract.containerType || '40 FT';
        const contractTolerance = contract.tolerancePercentage ?? 5;

        const itemsToCreate = dto.items.map((item) => {
          const itemContainerType = item.containerType || contractContainerType;
          const itemTolerance = item.tolerancePercentage ?? contractTolerance;
          const qtyDesc =
            item.quantityDescription ||
            getContractItemQuantityDescription(
              {
                ...contract,
                shipments: dto.shipments,
              },
              {
                ...item,
                containerType: itemContainerType,
                tolerancePercentage: itemTolerance,
              },
            );

          return {
            ...item,
            containerType: itemContainerType,
            tolerancePercentage: itemTolerance,
            quantityDescription: qtyDesc,
            salesContractId: contract.id,
          };
        });
        await this.itemModel.bulkCreate(itemsToCreate, { transaction: t });
      }

      let pcOrigin: string | null = null;
      let pcShipmentType: any = null;
      if (dto.shipments?.length || dto.transportDetails?.length) {
        try {
          const pcRows: any[] = await this.sequelize.query(
            `SELECT pc.place_of_loading, st.*
             FROM purchase_contracts pc
             LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
             WHERE pc.sales_contract_id = :scId
                OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :btId)
             ORDER BY pc.updated_at DESC, pc.id DESC
             LIMIT 1`,
            {
              replacements: {
                scId: contract.id,
                btId: contract.businessTransactionId || -1,
              },
              type: QueryTypes.SELECT,
              transaction: t,
            },
          );
          if (pcRows.length > 0) {
            pcOrigin = pcRows[0].place_of_loading;
            pcShipmentType = pcRows[0];
          }
        } catch (e) {}
      }

      // 4. Create Shipments
      if (dto.shipments && dto.shipments.length > 0) {
        const contractNo = (
          contract.contractNumber || dto.contractNumber
        )?.trim();

        // Enforce shipment quantity & container integrity
        const totalShipmentQty = dto.shipments.reduce(
          (sum, s) => sum + (Number(s.quantity) || 0),
          0,
        );
        const shouldDistribute =
          calculatedTotalQty > 0 &&
          Math.abs(totalShipmentQty - calculatedTotalQty) > 0.01;
        const autoQuantities = shouldDistribute
          ? distributeShipmentQuantities(
              calculatedTotalQty,
              (dto.items || []).find(
                (i) => i.qtyPerCount != null && Number(i.qtyPerCount) > 0,
              )?.qtyPerCount || dto.items?.[0]?.qtyPerCount,
              { allowRemainder: isRailFreight },
            )
          : [];

        // Auto Route Source Mapping & Dynamic Freight Evaluation
        const scDest =
          contract.destinationSelectionMode === 'enquiry'
            ? contract.enquiryDestination || null
            : contract.destinationLocationName ||
              contract.portOfDischarge ||
              null;

        const freightRule = evaluateFreightRequired(pcShipmentType, st);
        const isFreightRequired = freightRule.freightRequired;

        const shipmentsToCreate = dto.shipments.map((shipment, index) => {
          const sNo = shipment.shipmentNo || index + 1;
          const finalQty =
            shouldDistribute && autoQuantities[index] !== undefined
              ? autoQuantities[index]
              : shipment.quantity != null
                ? Number(shipment.quantity)
                : 0;
          const finalContainers =
            shipment.noOfContainers != null && shipment.noOfContainers >= 1
              ? shipment.noOfContainers
              : 1;

          return {
            ...shipment,
            shipmentNo: sNo,
            quantity: finalQty,
            noOfContainers: finalContainers,
            origin: pcOrigin,
            destination: scDest,
            status: shipment.status || 'Scheduled',
            freightRequired: isFreightRequired,
            freightAllocationStatus: 'No',
            freight: isFreightRequired
              ? shipment.freight !== undefined &&
                shipment.freight !== null &&
                (shipment.freight as any) !== ''
                ? parseFloat(shipment.freight as any)
                : null
              : null,
            freightCurrency: isFreightRequired
              ? shipment.freightCurrency || contract.currencyCode || null
              : null,
            freightDescription: isFreightRequired
              ? shipment.freightDescription || null
              : null,
            shipmentDate: new Date(shipment.shipmentDate),
            salesContractId: contract.id,
            companyId: contract.companyId || user?.companyId || null,
            shipmentReference: generateShipmentReference(
              contractNo,
              sNo,
              finalContainers,
              shipment.shipmentDate,
              finalQty,
            ),
          };
        }) as any[];
        await this.shipmentModel.bulkCreate(shipmentsToCreate, {
          transaction: t,
        });
      }

      // 5. Create Documents
      if (dto.documents && dto.documents.length > 0) {
        const docsToCreate = dto.documents.map((doc) => ({
          ...doc,
          salesContractId: contract.id,
        })) as any[];
        await this.documentModel.bulkCreate(docsToCreate, { transaction: t });
      }

      // 6. Create Transport Details
      if (
        dto.transportDetails &&
        Array.isArray(dto.transportDetails) &&
        dto.transportDetails.length > 0
      ) {
        const tdFreightCache = new Map<string, boolean>();
        const detailsToCreate = dto.transportDetails.map((td, index) => {
          const incoterm = td.incoterm.trim();
          let freightRequired = tdFreightCache.get(incoterm);
          if (freightRequired === undefined) {
            freightRequired = evaluateFreightRequired(
              pcShipmentType,
              incoterm,
            ).freightRequired;
            tdFreightCache.set(incoterm, freightRequired);
          }
          return {
            companyId,
            salesContractId: contract.id,
            parentId: String(contract.id),
            sequence: td.sequence != null ? td.sequence : index + 1,
            origin: td.origin.trim(),
            incoterm,
            destination: td.destination.trim(),
            freightRequired,
          };
        });
        await this.transportDetailModel.bulkCreate(detailsToCreate, {
          transaction: t,
        });
      }

      if (contract.status === 'Active') {
        await this.businessTransactionService.ensureForSalesContract(
          contract.id,
          user?.userId,
          t,
        );
      }

      return contract;
    });

    if (user?.userId) {
      try {
        this.notificationsGateway?.emitToUser(
          user.userId,
          'sales-target:updated',
          {
            contractId: createdContract.id,
            action: 'contract_created',
          },
        );
      } catch (err) {}
    }

    if (createdContract.enquiryId && this.logisticsService) {
      await this.logisticsService
        .syncLogisticsRoutesForEnquiry(createdContract.enquiryId, companyId)
        .catch(() => {});
    }

    return createdContract;
  }

  async findAll(query: QuerySalesContractDto & { companyId?: number }) {
    const {
      search,
      businessReference,
      status,
      buyerId,
      financialYear,
      page = 1,
      limit = 10,
    } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    // Tenant isolation
    if (query.companyId) whereClause.companyId = query.companyId;
    if (search) {
      const searchConditions: any[] = [
        { contractNumber: { [Op.iLike]: `%${search}%` } },
      ];
      if (isBusinessReferenceSearch(search)) {
        const transactionId = await resolveBusinessTransactionId(
          search,
          query.companyId,
        );
        if (transactionId !== null) {
          searchConditions.push({ businessTransactionId: transactionId });
        }
      }
      whereClause[Op.or] = searchConditions;
    }
    if (businessReference) {
      whereClause.businessTransactionId =
        (await resolveBusinessTransactionId(
          businessReference,
          query.companyId,
        )) ?? -1;
    }
    if (status) whereClause.status = status;
    if (buyerId) whereClause.buyerId = buyerId;
    if (financialYear) whereClause.financialYear = financialYear;

    const sortDirection =
      String(query.sortOrder || 'DESC').toUpperCase() === 'ASC'
        ? 'ASC'
        : 'DESC';
    const order: Order =
      query.sortBy === 'businessReference'
        ? [
            [
              { model: BusinessTransaction, as: 'businessTransaction' },
              'businessReference',
              sortDirection,
            ],
          ]
        : [
            ['contractDate', 'DESC'],
            ['createdAt', 'DESC'],
          ];

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      include: [
        { model: Partner, as: 'buyer', attributes: ['id', 'entityName'] },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
        { model: SalesContractDocument, attributes: ['id'] },
        { model: SalesContractDocumentFile, attributes: ['id'] },
        {
          model: SalesContractItem,
          include: [{ model: Product, attributes: ['name'] }],
        },
        {
          model: PurchaseContract,
          attributes: ['id', 'quantity', 'status'],
          required: false,
          include: [
            {
              model: PurchaseContractItem,
              attributes: ['quantity'],
              required: false,
            },
          ],
        },
        {
          model: TransportDetail,
          as: 'transportDetails',
          required: false,
        },
      ],
      distinct: true,
      limit: Number(limit),
      offset: Number(offset),
      order,
    });

    // Attach calculated purchase contract allocation & status
    const data = rows.map((row) => {
      const plain = row.toJSON() as any;
      plain.businessReference =
        plain.businessTransaction?.businessReference ?? null;

      const salesQty =
        Number(plain.totalQuantity) ||
        (Array.isArray(plain.items)
          ? plain.items.reduce(
              (sum: number, item: any) => sum + (Number(item.quantity) || 0),
              0,
            )
          : 0);

      let allocatedQty = 0;
      if (Array.isArray(plain.purchaseContracts)) {
        for (const pc of plain.purchaseContracts) {
          const st = String(pc.status || '').toLowerCase();
          if (st !== 'cancelled' && st !== 'rejected') {
            let pcQty = Number(pc.quantity) || 0;
            if (pcQty === 0 && Array.isArray(pc.items) && pc.items.length > 0) {
              pcQty = pc.items.reduce(
                (s: number, it: any) => s + (Number(it.quantity) || 0),
                0,
              );
            }
            allocatedQty += pcQty;
          }
        }
      }
      allocatedQty = Math.round(allocatedQty * 100) / 100;
      const remainingQty = Math.max(
        0,
        Math.round((salesQty - allocatedQty) * 100) / 100,
      );

      let purchaseContractStatus: 'NO' | 'PARTIAL' | 'FULL' = 'NO';
      if (allocatedQty <= 0) {
        purchaseContractStatus = 'NO';
      } else if (allocatedQty >= salesQty && salesQty > 0) {
        purchaseContractStatus = 'FULL';
      } else {
        purchaseContractStatus = 'PARTIAL';
      }

      plain.allocatedQty = allocatedQty;
      plain.remainingQty = remainingQty;
      plain.purchaseContractStatus = purchaseContractStatus;
      plain.hasPurchaseContract =
        allocatedQty > 0 ||
        (Array.isArray(plain.purchaseContracts) &&
          plain.purchaseContracts.length > 0);

      return plain;
    });

    return {
      data,
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
        {
          model: Enquiry,
          as: 'enquiry',
          include: [
            { model: Partner, as: 'broker' },
            { model: PartnerRole, as: 'brokerRole' },
          ],
          required: false,
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
          attributes: ['id', 'businessReference'],
          required: false,
        },
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
        {
          model: PurchaseContract,
          attributes: ['id', 'quantity', 'status'],
          required: false,
          include: [
            {
              model: PurchaseContractItem,
              attributes: ['quantity'],
              required: false,
            },
          ],
        },
        {
          model: TransportDetail,
          as: 'transportDetails',
          required: false,
        },
      ],
    });

    if (!item) {
      throw new NotFoundException('Sales Contract not found');
    }

    if (!item.brokerId && (item as any).enquiry?.brokerId) {
      item.brokerId = (item as any).enquiry.brokerId;
      if ((item as any).enquiry.broker) {
        (item as any).setDataValue('broker', (item as any).enquiry.broker);
      }
    }

    // Ensure items have quality resolved from printOverrides if not already present
    if (item.items && Array.isArray(item.items)) {
      const printOverrides = item.printOverrides || {};
      item.items.forEach((it: any, idx: number) => {
        const curQuality = it.getDataValue
          ? it.getDataValue('quality')
          : it.quality;
        if (!curQuality || !String(curQuality).trim()) {
          const overrideQuality =
            printOverrides[`quality_${idx}`] ||
            (idx === 0 ? printOverrides['quality_0'] : null);
          if (overrideQuality && String(overrideQuality).trim()) {
            if (it.setDataValue) {
              it.setDataValue('quality', String(overrideQuality).trim());
            } else {
              it.quality = String(overrideQuality).trim();
            }
          }
        }

        const curDesc = it.getDataValue
          ? it.getDataValue('quantityDescription')
          : it.quantityDescription;
        if (!curDesc || !String(curDesc).trim()) {
          const generatedDesc = getContractItemQuantityDescription(item, it);
          if (it.setDataValue) {
            it.setDataValue('quantityDescription', generatedDesc);
          } else {
            it.quantityDescription = generatedDesc;
          }
        }
      });
    }

    const scJson = item.toJSON();
    const salesQty =
      Number(scJson.totalQuantity) ||
      (Array.isArray(scJson.items)
        ? scJson.items.reduce(
            (sum: number, it: any) => sum + (Number(it.quantity) || 0),
            0,
          )
        : 0);

    let allocatedQty = 0;
    if (Array.isArray(scJson.purchaseContracts)) {
      for (const pc of scJson.purchaseContracts) {
        const st = String(pc.status || '').toLowerCase();
        if (st !== 'cancelled' && st !== 'rejected') {
          let pcQty = Number(pc.quantity) || 0;
          if (pcQty === 0 && Array.isArray(pc.items) && pc.items.length > 0) {
            pcQty = pc.items.reduce(
              (s: number, it: any) => s + (Number(it.quantity) || 0),
              0,
            );
          }
          allocatedQty += pcQty;
        }
      }
    }
    allocatedQty = Math.round(allocatedQty * 100) / 100;
    const remainingQty = Math.max(
      0,
      Math.round((salesQty - allocatedQty) * 100) / 100,
    );

    let purchaseContractStatus: 'NO' | 'PARTIAL' | 'FULL' = 'NO';
    if (allocatedQty <= 0) {
      purchaseContractStatus = 'NO';
    } else if (allocatedQty >= salesQty && salesQty > 0) {
      purchaseContractStatus = 'FULL';
    } else {
      purchaseContractStatus = 'PARTIAL';
    }

    (item as any).setDataValue('allocatedQty', allocatedQty);
    (item as any).setDataValue('remainingQty', remainingQty);
    (item as any).setDataValue(
      'purchaseContractStatus',
      purchaseContractStatus,
    );
    (item as any).setDataValue(
      'hasPurchaseContract',
      allocatedQty > 0 ||
        (Array.isArray(scJson.purchaseContracts) &&
          scJson.purchaseContracts.length > 0),
    );

    return item;
  }

  async update(
    id: number,
    dto: UpdateSalesContractDto,
    user: any,
  ): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);

    if (
      dto.enquiryId !== undefined &&
      dto.enquiryId !== contract.enquiryId &&
      contract.businessTransactionId != null
    ) {
      throw new ConflictException(
        'An allocated Sales Contract cannot be reassigned to a different Enquiry',
      );
    }

    await this.validateForeignKeys(user?.companyId, dto);

    await this.sequelize.transaction(async (t) => {
      if (dto.status === 'Active' && (dto.enquiryId ?? contract.enquiryId)) {
        await this.businessTransactionService.ensureForSalesContract(
          contract.id,
          user?.userId,
          t,
        );
      }
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
      if (
        dto.transportDetails !== undefined &&
        Array.isArray(dto.transportDetails)
      ) {
        for (const [idx, item] of dto.transportDetails.entries()) {
          if (
            !item.origin?.trim() ||
            !item.incoterm?.trim() ||
            !item.destination?.trim()
          ) {
            throw new BadRequestException(
              `Transport Details row ${idx + 1} must contain Place of Loading (POL), Incoterm, and Destination.`,
            );
          }
        }
      }
      const effectiveShipmentTypeId =
        dto.shipmentTypeId !== undefined
          ? dto.shipmentTypeId
            ? Number(dto.shipmentTypeId)
            : null
          : contract.shipmentTypeId;
      let destLocName = dto.destinationLocationName;
      let st: any = null;
      if (effectiveShipmentTypeId) {
        st = await ShipmentType.findOne({
          where: {
            id: effectiveShipmentTypeId,
            companyId: contract.companyId || user?.companyId,
          },
        });
        if (st && st.salesContractDeliveryPlaceRequired === false) {
          destLocName = null;
        }
      }

      let pcShipmentType: any = null;
      if (contract.businessTransactionId || contract.id) {
        try {
          const pcRows: any = await this.sequelize.query(
            `SELECT pc.place_of_loading, st.* 
             FROM purchase_contracts pc
             LEFT JOIN shipment_types st ON st.id = pc.shipment_type_id
             WHERE pc.sales_contract_id = :scId
                OR (pc.business_transaction_id IS NOT NULL AND pc.business_transaction_id = :btId)
             ORDER BY pc.updated_at DESC LIMIT 1`,
            {
              replacements: {
                scId: contract.id,
                btId: contract.businessTransactionId || -1,
              },
              type: QueryTypes.SELECT,
              transaction: t,
            },
          );
          if (pcRows && pcRows.length > 0) {
            pcShipmentType = pcRows[0];
          }
        } catch (e) {}
      }
      const freightRule = evaluateFreightRequired(pcShipmentType, st);
      const isFreightRequired = freightRule.freightRequired;

      const updateData: any = {
        ...dto,
        ...(destLocName !== undefined
          ? { destinationLocationName: destLocName }
          : {}),
        totalQuantity: calculatedTotalQty,
        totalAmount: calculatedTotalAmt,
        updatedBy: user?.userId,
      };
      if (dto.contractDate) {
        updateData.contractDate = new Date(dto.contractDate);
      }

      // Synchronize printOverrides with items' quality so View mode and Print templates match
      if (dto.items && dto.items.length > 0) {
        const currentOverrides = {
          ...(contract.printOverrides || {}),
          ...(dto.printOverrides || {}),
        };
        let overridesModified = false;
        dto.items.forEach((it: any, idx: number) => {
          if (it.quality && String(it.quality).trim()) {
            const val = String(it.quality).trim();
            currentOverrides[`quality_${idx}`] = val;
            if (idx === 0) {
              currentOverrides['quality_0'] = val;
            }
            overridesModified = true;
          }
        });
        if (overridesModified) {
          updateData.printOverrides = currentOverrides;
        }
      }

      await contract.update(updateData, { transaction: t });

      // 2. Update Items
      const isRailFreight =
        getContractTransportMode({
          originTransportMode:
            dto.originTransportMode !== undefined
              ? dto.originTransportMode
              : contract.originTransportMode,
          destinationTransportMode:
            dto.destinationTransportMode !== undefined
              ? dto.destinationTransportMode
              : contract.destinationTransportMode,
          transportMode:
            dto.transportMode !== undefined
              ? dto.transportMode
              : contract.transportMode,
        }) === 'RAIL';

      if (dto.items) {
        dto.items.forEach((item) => {
          if (isRailFreight) {
            // Skip exact multiple validation for Rail Freight / Wagon
          } else if (
            item.qtyPerCount != null &&
            Number(item.qtyPerCount) > 0 &&
            item.quantity != null &&
            Number(item.quantity) > 0 &&
            !isDivisible(item.quantity, item.qtyPerCount)
          ) {
            throw new BadRequestException(
              `Product Quantity (${item.quantity} MT) is not divisible by Qty Per Count (${item.qtyPerCount} MT). Product Quantity must be an exact multiple of Qty Per Count.`,
            );
          }
        });
        const existingItems = await this.itemModel.findAll({
          where: { salesContractId: contract.id },
          transaction: t,
        });
        const updatedItemIds: number[] = [];

        const mode =
          contract.transportMode ||
          contract.originTransportMode ||
          contract.destinationTransportMode ||
          'sea';
        const contractContainerType = contract.containerType || '40 FT';
        const contractTolerance = contract.tolerancePercentage ?? 5;

        for (let index = 0; index < dto.items.length; index++) {
          const item = dto.items[index] as any;
          let existing = existingItems.find((i) => item.id && i.id === item.id);
          if (!existing && index < existingItems.length && !item.id) {
            existing = existingItems[index];
          }

          const itemContainerType =
            item.containerType ||
            existing?.containerType ||
            contractContainerType;
          const itemTolerance =
            item.tolerancePercentage ??
            existing?.tolerancePercentage ??
            contractTolerance;
          const itemUnitCount = item.unitCount ?? existing?.unitCount;
          const itemQtyPerCount = item.qtyPerCount ?? existing?.qtyPerCount;
          const itemQuantity = item.quantity ?? existing?.quantity;

          const qtyDesc =
            item.quantityDescription ||
            getContractItemQuantityDescription(
              {
                ...contract,
                shipments: dto.shipments || contract.shipments,
              },
              {
                ...item,
                containerType: itemContainerType,
                tolerancePercentage: itemTolerance,
                unitCount: itemUnitCount,
                qtyPerCount: itemQtyPerCount,
                quantity: itemQuantity,
              },
            );

          if (existing) {
            const qualityToSave =
              item.quality !== undefined &&
              item.quality !== null &&
              String(item.quality).trim() !== ''
                ? String(item.quality).trim()
                : existing.quality;
            await existing.update(
              {
                ...item,
                quality: qualityToSave,
                containerType: itemContainerType,
                tolerancePercentage: itemTolerance,
                quantityDescription: qtyDesc,
                salesContractId: contract.id,
              },
              { transaction: t },
            );
            updatedItemIds.push(existing.id);
          } else {
            const created = await this.itemModel.create(
              {
                ...item,
                containerType: itemContainerType,
                tolerancePercentage: itemTolerance,
                quantityDescription: qtyDesc,
                salesContractId: contract.id,
              },
              { transaction: t },
            );
            updatedItemIds.push(created.id);
          }
        }

        const itemsToDelete = existingItems.filter(
          (i) => !updatedItemIds.includes(i.id),
        );
        for (const item of itemsToDelete) {
          await item.destroy({ transaction: t });
        }
      }

      // 3. Update Shipments (In-place update to preserve PKs & FK links, e.g. purchase_contract_shipments)
      if (dto.shipments) {
        const existingShipments = await this.shipmentModel.findAll({
          where: { salesContractId: contract.id },
          order: [
            ['shipmentNo', 'ASC'],
            ['id', 'ASC'],
          ],
          transaction: t,
        });

        const contractNo = (
          dto.contractNumber || contract.contractNumber
        )?.trim();

        // Check which shipments are referenced by purchase contract links.
        const existingIds = existingShipments.map((s) => s.id);
        let referencedShipmentIds = new Set<number>();
        if (existingIds.length > 0) {
          const referencedRows: any[] = await this.sequelize.query(
            `SELECT DISTINCT shipment_id FROM (
              SELECT shipment_id FROM purchase_contract_shipments WHERE shipment_id IN (:ids)
            ) ref`,
            {
              replacements: { ids: existingIds },
              type: QueryTypes.SELECT,
              transaction: t,
            },
          );
          referencedShipmentIds = new Set(
            referencedRows.map((r: any) => Number(r.shipment_id)),
          );
        }

        // Avoid unique-key collisions (idx_shipment_contract_no) during renumbering
        // by setting temporary negative shipment numbers in a single SQL update
        if (existingIds.length > 0) {
          await this.sequelize.query(
            `UPDATE sales_contract_shipments 
             SET shipment_no = - (100000 + id) 
             WHERE sales_contract_id = :scId`,
            {
              replacements: { scId: contract.id },
              transaction: t,
            },
          );
        }

        // Match dto.shipments to existing shipments to preserve stable PK IDs
        const usedExistingIds = new Set<number>();
        const matchedExisting: (SalesContractShipment | null)[] = [];

        for (let i = 0; i < dto.shipments.length; i++) {
          const incoming = dto.shipments[i] as any;
          const sNo = incoming.shipmentNo || i + 1;
          let match: SalesContractShipment | undefined;

          // 1. Explicit ID match
          if (incoming.id) {
            match = existingShipments.find(
              (e) => e.id === Number(incoming.id) && !usedExistingIds.has(e.id),
            );
          }

          // 2. Match by shipmentNo
          if (!match) {
            match = existingShipments.find(
              (e) => e.shipmentNo === sNo && !usedExistingIds.has(e.id),
            );
          }

          // 3. Match any unused referenced shipment first (preserve referenced IDs)
          if (!match) {
            match = existingShipments.find(
              (e) =>
                !usedExistingIds.has(e.id) && referencedShipmentIds.has(e.id),
            );
          }

          // 4. Match any remaining unused existing shipment
          if (!match) {
            match = existingShipments.find((e) => !usedExistingIds.has(e.id));
          }

          if (match) {
            usedExistingIds.add(match.id);
            matchedExisting.push(match);
          } else {
            matchedExisting.push(null);
          }
        }

        // Enforce shipment quantity & container integrity
        const totalShipmentQty = dto.shipments.reduce(
          (sum, s) => sum + (Number(s.quantity) || 0),
          0,
        );
        const shouldDistribute =
          calculatedTotalQty > 0 &&
          Math.abs(totalShipmentQty - calculatedTotalQty) > 0.01;
        const autoQuantities = shouldDistribute
          ? distributeShipmentQuantities(
              calculatedTotalQty,
              (dto.items || []).find(
                (i) => i.qtyPerCount != null && Number(i.qtyPerCount) > 0,
              )?.qtyPerCount || dto.items?.[0]?.qtyPerCount,
              { allowRemainder: isRailFreight },
            )
          : [];

        const scDest =
          contract.destinationSelectionMode === 'enquiry'
            ? contract.enquiryDestination || null
            : contract.destinationLocationName ||
              contract.portOfDischarge ||
              null;
        let pcOrigin: string | null = null;
        try {
          const pcRows: any = await this.sequelize.query(
            `SELECT place_of_loading FROM purchase_contracts WHERE (sales_contract_id = :scId OR (business_transaction_id IS NOT NULL AND business_transaction_id = :btId)) AND place_of_loading IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
            {
              replacements: {
                scId: contract.id,
                btId: contract.businessTransactionId || -1,
              },
              type: QueryTypes.SELECT,
            },
          );
          if (pcRows && pcRows.length > 0)
            pcOrigin = pcRows[0].place_of_loading;
        } catch (e) {}

        const updatedShipmentIds: number[] = [];

        for (let index = 0; index < dto.shipments.length; index++) {
          const shipment = dto.shipments[index] as any;
          const sNo = shipment.shipmentNo || index + 1;
          const finalQty =
            shouldDistribute && autoQuantities[index] !== undefined
              ? autoQuantities[index]
              : shipment.quantity != null
                ? Number(shipment.quantity)
                : 0;
          const finalContainers =
            shipment.noOfContainers != null && shipment.noOfContainers >= 1
              ? shipment.noOfContainers
              : 1;

          const existing = matchedExisting[index];

          const shipmentRef = generateShipmentReference(
            contractNo,
            sNo,
            finalContainers,
            shipment.shipmentDate,
            finalQty,
          );

          if (existing) {
            const shipmentFreightRequired = isFreightRequired;
            await existing.update(
              {
                ...shipment,
                shipmentNo: sNo,
                quantity: finalQty,
                noOfContainers: finalContainers,
                companyId:
                  existing.companyId ||
                  contract.companyId ||
                  user?.companyId ||
                  null,
                origin: pcOrigin || existing.origin,
                destination: scDest || existing.destination,
                shipmentDate: new Date(shipment.shipmentDate),
                shipmentReference: shipmentRef,
                status: shipment.status || existing.status || 'Scheduled',
                freightRequired: shipmentFreightRequired,
                freightAllocationStatus:
                  existing.freightAllocationStatus || 'No',
                freight: shipmentFreightRequired
                  ? shipment.freight !== undefined &&
                    shipment.freight !== null &&
                    (shipment.freight as any) !== ''
                    ? parseFloat(shipment.freight as any)
                    : (existing.freight ?? null)
                  : null,
                freightCurrency: shipmentFreightRequired
                  ? shipment.freightCurrency ||
                    (existing as any).freightCurrency ||
                    contract.currencyCode ||
                    null
                  : null,
                freightDescription: shipmentFreightRequired
                  ? shipment.freightDescription !== undefined
                    ? shipment.freightDescription
                    : ((existing as any).freightDescription ?? null)
                  : null,
              },
              { transaction: t },
            );
            updatedShipmentIds.push(existing.id);

            // Sync dependent Purchase Shipment allocated_quantity if referenced
            if (referencedShipmentIds.has(existing.id)) {
              await this.sequelize.query(
                `UPDATE purchase_contract_shipments 
                 SET allocated_quantity = :qty 
                 WHERE shipment_id = :sId AND (allocated_quantity IS NULL OR allocated_quantity > :qty)`,
                {
                  replacements: { qty: finalQty, sId: existing.id },
                  transaction: t,
                },
              );
            }
          } else {
            const created = await this.shipmentModel.create(
              {
                ...shipment,
                salesContractId: contract.id,
                companyId: contract.companyId || user?.companyId || null,
                shipmentNo: sNo,
                quantity: finalQty,
                noOfContainers: finalContainers,
                origin: pcOrigin,
                destination: scDest,
                shipmentDate: new Date(shipment.shipmentDate),
                shipmentReference: shipmentRef,
                status: shipment.status || 'Scheduled',
                freightRequired: isFreightRequired,
                freightAllocationStatus: 'No',
                freight: isFreightRequired
                  ? shipment.freight !== undefined &&
                    shipment.freight !== null &&
                    (shipment.freight as any) !== ''
                    ? parseFloat(shipment.freight as any)
                    : null
                  : null,
                freightCurrency: isFreightRequired
                  ? shipment.freightCurrency || contract.currencyCode || null
                  : null,
                freightDescription: isFreightRequired
                  ? shipment.freightDescription || null
                  : null,
              },
              { transaction: t },
            );
            updatedShipmentIds.push(created.id);
          }
        }

        // Sync destination across all contract shipments if destination was updated
        if (
          dto.destinationSelectionMode !== undefined ||
          dto.enquiryDestination !== undefined ||
          dto.destinationLocationName !== undefined ||
          dto.portOfDischarge !== undefined
        ) {
          await this.shipmentModel.update(
            { destination: scDest },
            { where: { salesContractId: contract.id }, transaction: t },
          );
        }

        // Handle unused existing shipments
        const shipmentsToDelete = existingShipments.filter(
          (s) => !updatedShipmentIds.includes(s.id),
        );

        for (const s of shipmentsToDelete) {
          // If referenced by Purchase Contract or cargo, NEVER delete - soft cancel to preserve FK integrity
          if (referencedShipmentIds.has(s.id)) {
            await s.update(
              {
                status: 'Cancelled',
                quantity: 0,
                shipmentNo: 90000 + s.id,
                remarks: s.remarks ? `${s.remarks} [Cancelled]` : 'Cancelled',
              },
              { transaction: t },
            );
          } else {
            // Orphan shipment: safe to delete
            await s.destroy({ transaction: t });
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
            (d) =>
              (doc.id && d.id === doc.id) ||
              d.tradeDocumentId === doc.tradeDocumentId,
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
              },
              { transaction: t },
            );
            updatedDocIds.push(created.id);
          }
        }

        const docsToDelete = existingDocs.filter(
          (d) => !updatedDocIds.includes(d.id),
        );
        for (const doc of docsToDelete) {
          await doc.destroy({ transaction: t });
        }
      }

      // 5. Update Transport Details
      if (dto.transportDetails !== undefined) {
        await this.transportDetailModel.destroy({
          where: { salesContractId: contract.id },
          transaction: t,
        });
        if (
          Array.isArray(dto.transportDetails) &&
          dto.transportDetails.length > 0
        ) {
          const tdFreightCache = new Map<string, boolean>();
          const detailsToCreate = dto.transportDetails.map((td, index) => {
            const incoterm = td.incoterm.trim();
            let freightRequired = tdFreightCache.get(incoterm);
            if (freightRequired === undefined) {
              freightRequired = evaluateFreightRequired(
                pcShipmentType,
                incoterm,
              ).freightRequired;
              tdFreightCache.set(incoterm, freightRequired);
            }
            return {
              companyId: contract.companyId || user?.companyId,
              salesContractId: contract.id,
              parentId: String(contract.id),
              sequence: td.sequence != null ? td.sequence : index + 1,
              origin: td.origin.trim(),
              incoterm,
              destination: td.destination.trim(),
              freightRequired,
            };
          });
          await this.transportDetailModel.bulkCreate(detailsToCreate, {
            transaction: t,
          });
        }
      }

      if (contract.status === 'Active') {
        await this.businessTransactionService.ensureForSalesContract(
          contract.id,
          user?.userId,
          t,
        );
      }
    });

    const updated = await this.findOne(id);

    if (updated.enquiryId && this.logisticsService) {
      await this.logisticsService
        .syncLogisticsRoutesForEnquiry(
          updated.enquiryId,
          updated.companyId || user?.companyId,
        )
        .catch(() => {});
    }

    const creatorId = updated.createdBy;
    if (creatorId) {
      try {
        this.notificationsGateway?.emitToUser(
          creatorId,
          'sales-target:updated',
          {
            contractId: updated.id,
            action: 'contract_updated',
          },
        );
      } catch (err) {}
    }
    if (user?.userId && user.userId !== creatorId) {
      try {
        this.notificationsGateway?.emitToUser(
          user.userId,
          'sales-target:updated',
          {
            contractId: updated.id,
            action: 'contract_updated',
          },
        );
      } catch (err) {}
    }

    return updated;
  }

  async updateStatus(
    id: number,
    dto: UpdateSalesContractStatusDto,
    user: any,
  ): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);

    if (dto.status === 'Active') {
      const mandatoryDocs = contract.documents.filter((doc) => doc.isMandatory);
      if (mandatoryDocs.length > 0) {
        const uploadedFiles = await this.documentFileModel.findAll({
          where: { salesContractId: id },
        });

        const missingDocs = [];
        for (const doc of mandatoryDocs) {
          const hasFile = uploadedFiles.some(
            (f) => f.tradeDocumentId === doc.tradeDocumentId,
          );
          if (!hasFile) {
            missingDocs.push(doc.tradeDocument.name);
          }
        }

        if (missingDocs.length > 0) {
          throw new BadRequestException(
            `Cannot activate contract.\nMissing Documents:\n- ${missingDocs.join('\n- ')}`,
          );
        }
      }
    }

    await this.sequelize.transaction(async (transaction) => {
      if (dto.status === 'Active' && contract.enquiryId) {
        await this.businessTransactionService.ensureForSalesContract(
          contract.id,
          user?.userId,
          transaction,
        );
      }
      await contract.update(
        { status: dto.status, updatedBy: user?.userId },
        { transaction },
      );
      if (dto.status === 'Active') {
        await this.businessTransactionService.ensureForSalesContract(
          contract.id,
          user?.userId,
          transaction,
        );
      }
    });
    return contract.reload();
  }

  async getDistinctFinancialYears(companyId?: number): Promise<string[]> {
    const whereSql = companyId
      ? `WHERE company_id = ${companyId} AND financial_year IS NOT NULL`
      : `WHERE financial_year IS NOT NULL`;
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
      const seq = parseSequenceFromContractNumber(
        row.contract_number,
        sellerCode,
        fySuffix,
        includeBuyerInitial,
      );
      if (seq !== null && (maxSequence === null || seq > maxSequence)) {
        maxSequence = seq;
      }
    }

    const nextSequence =
      maxSequence !== null ? maxSequence + 4 : initialSequence;
    // Build prefix: buyer initial (if applicable) + seller code
    const prefix = buildContractPrefix(
      buyer.entityName,
      sellerCode,
      includeBuyerInitial,
    );
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
        const mapping = mappingFiles.find(
          (f) => f.tradeDocumentId === doc.tradeDocumentId,
        );
        docMap.set(doc.tradeDocumentId, {
          tradeDocument: {
            id: doc.tradeDocument.id,
            name: doc.tradeDocument.name,
            mandatoryByDefault: doc.tradeDocument.mandatoryByDefault,
          },
          uploaded: !!mapping,
          attachment:
            mapping && mapping.attachment
              ? {
                  id: mapping.attachment.id,
                  originalName: mapping.attachment.originalName,
                  mimeType: mapping.attachment.mimeType,
                  fileSize: mapping.attachment.fileSize,
                  downloadUrl: `/attachments/${mapping.attachment.id}/download`,
                }
              : null,
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
          attachment: mapping.attachment
            ? {
                id: mapping.attachment.id,
                originalName: mapping.attachment.originalName,
                mimeType: mapping.attachment.mimeType,
                fileSize: mapping.attachment.fileSize,
                downloadUrl: `/attachments/${mapping.attachment.id}/download`,
              }
            : null,
        });
      }
    }

    return Array.from(docMap.values());
  }

  async uploadDocument(
    id: number,
    tradeDocumentId: number,
    file: Express.Multer.File,
    user: any,
    companyId: number,
  ) {
    // 1. Create attachment via central engine
    const attachment = await this.attachmentsService.createAttachment(
      file,
      user?.userId,
      companyId,
    );

    // 2. Check if mapping already exists
    const existingMapping = await this.documentFileModel.findOne({
      where: { salesContractId: id, tradeDocumentId },
    });

    if (existingMapping) {
      // 3. Re-upload flow: delete old attachment (engine handles file + generic row)
      await this.attachmentsService.deleteAttachment(
        existingMapping.attachmentId,
      );

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
    await this.attachmentsService.deleteAttachment(
      existingMapping.attachmentId,
    );

    // 2. Delete mapping row
    await existingMapping.destroy();

    return { success: true };
  }

  async remove(id: number, user: any): Promise<SalesContract> {
    const contract = await this.findOne(id, user?.companyId);
    if (contract.status !== 'Draft' && contract.status !== 'Cancelled') {
      throw new BadRequestException(
        'Only Draft or Cancelled contracts can be deleted',
      );
    }
    await contract.update({ status: 'Cancelled', updatedBy: user?.userId });

    const creatorId = contract.createdBy;
    if (creatorId) {
      try {
        this.notificationsGateway?.emitToUser(
          creatorId,
          'sales-target:updated',
          {
            contractId: contract.id,
            action: 'contract_deleted',
          },
        );
      } catch (err) {}
    }
    if (user?.userId && user.userId !== creatorId) {
      try {
        this.notificationsGateway?.emitToUser(
          user.userId,
          'sales-target:updated',
          {
            contractId: contract.id,
            action: 'contract_deleted',
          },
        );
      } catch (err) {}
    }

    return contract.reload();
  }
}
