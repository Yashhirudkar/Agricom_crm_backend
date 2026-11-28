import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ExportInvoice } from '../models/export-invoice.model';
import { ExportInvoiceSequence } from '../models/export-invoice-sequence.model';
import { ExportInvoiceStuffingGroup } from '../models/export-invoice-stuffing-group.model';
import { BankDetailsProviderService } from './bank-details-provider.service';
import { InvoiceNumberService } from './invoice-number.service';
import { SignatureProviderService } from './signature-provider.service';
import { convertAmountToWords } from '../utils/amount-in-words.util';
import { CreateExportInvoiceDto } from '../dto/create-export-invoice.dto';
import { UpdateExportInvoiceDto } from '../dto/update-export-invoice.dto';
import { QueryExportInvoiceDto } from '../dto/query-export-invoice.dto';

import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { ShipmentStuffing } from '../../sales-contracts/models/shipment-stuffing.model';
import { StuffingExecutionGroup } from '../../sales-contracts/models/stuffing-execution-group.model';
import { StuffingExecutionGroupItem } from '../../sales-contracts/models/stuffing-execution-group-item.model';
import { ShipmentType } from '../../masters/shipment-type/shipment-type.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { BagType } from '../../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../../masters/bag-specs/models/packing-type.model';
import { BagSpecification } from '../../masters/bag-specs/models/bag-specification.model';
import { normalizeTransportMode } from '../../sales-contracts/utils/quantity-description.util';
import { Company } from '../../companies/models/company.model';
import { PaymentTerm } from '../../masters/payment-term/payment-term.model';
import { PurchaseContract } from '../../purchase-contracts/models/purchase-contract.model';
import { PurchaseContractShipment } from '../../purchase-contracts/models/purchase-contract-shipment.model';
import { BusinessTransaction } from '../../system/models/business-transaction.model';
import {
  isBusinessReferenceSearch,
  resolveBusinessTransactionId,
} from '../../system/utils/business-reference-query.util';

@Injectable()
export class ExportInvoicesService {
  private readonly logger = new Logger(ExportInvoicesService.name);

  constructor(
    @InjectModel(ExportInvoice)
    private readonly invoiceModel: typeof ExportInvoice,
    @InjectModel(SalesContractShipment)
    private readonly shipmentModel: typeof SalesContractShipment,
    @InjectModel(SalesContract)
    private readonly contractModel: typeof SalesContract,
    @InjectModel(ShipmentStuffing)
    private readonly stuffingModel: typeof ShipmentStuffing,
    @InjectModel(PurchaseContract)
    private readonly purchaseContractModel: typeof PurchaseContract,
    private readonly bankProvider: BankDetailsProviderService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly signatureProvider: SignatureProviderService,
    @Optional()
    @InjectModel(StuffingExecutionGroup)
    private readonly stuffingGroupModel?: typeof StuffingExecutionGroup,
    @Optional()
    @InjectModel(StuffingExecutionGroupItem)
    private readonly stuffingGroupItemModel?: typeof StuffingExecutionGroupItem,
    @Optional()
    @InjectModel(ExportInvoiceStuffingGroup)
    private readonly invoiceStuffingGroupModel?: typeof ExportInvoiceStuffingGroup,
  ) {}

  /**
   * Initializes Export Invoice data automatically mapped from ERP:
   * Sales Contract -> Purchase Contract -> Shipment -> Stuffing Execution -> Invoice
   */
  async initFromShipment(shipmentId: number, user?: any) {
    const shipment = await this.shipmentModel.findByPk(shipmentId, {
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
            { model: Company, as: 'company' },
            { model: PaymentTerm, as: 'paymentTerm' },
            {
              model: SalesContractItem,
              as: 'items',
              include: [
                { model: Product, as: 'product' },
                { model: PackingType, as: 'packingType' },
                { model: BagSpecification, as: 'bagSpecification' },
              ],
            },
          ],
        },
        {
          model: ShipmentStuffing,
          as: 'stuffingExecution',
        },
        {
          model: BusinessTransaction,
          as: 'businessTransaction',
        },
        {
          model: Company,
          as: 'company',
        },
      ],
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment #${shipmentId} not found`);
    }

    const contract = shipment.salesContract;
    if (!contract) {
      throw new BadRequestException(
        `Shipment #${shipmentId} has no associated Sales Contract`,
      );
    }

    // 1. Trace Purchase Contract for Place of Loading
    let purchaseContract: any = null;
    let placeOfLoading = '';

    try {
      const pcShipmentLink: any = await PurchaseContractShipment.findOne({
        where: { shipmentId: shipment.id },
      });
      if (pcShipmentLink?.purchaseContractId) {
        purchaseContract = await this.purchaseContractModel.findByPk(
          pcShipmentLink.purchaseContractId,
        );
      } else if (contract.id) {
        purchaseContract = await this.purchaseContractModel.findOne({
          where: { salesContractId: contract.id },
          order: [['updatedAt', 'DESC']],
        });
      }

      if (purchaseContract?.placeOfLoading) {
        placeOfLoading = purchaseContract.placeOfLoading;
      }
    } catch (e) {
      this.logger.warn(`Could not trace Purchase Contract for shipment #${shipmentId}: ${e.message}`);
    }

    if (!placeOfLoading) {
      placeOfLoading =
        contract.originLocationName ||
        contract.portOfLoading ||
        contract.originCountry ||
        '';
    }

    // 2. Fetch or retrieve Stuffing Execution data
    let stuffing: ShipmentStuffing | null = shipment.stuffingExecution;
    if (!stuffing) {
      stuffing = await this.stuffingModel.findOne({
        where: { shipmentId: shipment.id },
      });
    }

    // Dynamic truck numbers from Stuffing Execution
    const truckSet = new Set<string>();
    const containerSet = new Set<string>();

    if (stuffing) {
      if (Array.isArray(stuffing.trucks)) {
        stuffing.trucks.forEach((t: any) => {
          if (t?.truckNo?.trim()) truckSet.add(t.truckNo.trim());
        });
      }
      if (Array.isArray(stuffing.containers)) {
        stuffing.containers.forEach((c: any) => {
          if (c?.containerNo?.trim()) containerSet.add(c.containerNo.trim());
        });
      }
    }

    const truckNumbers = Array.from(truckSet);
    const containerNumbers = Array.from(containerSet);

    // 3. Parties Mapping
    // Seller: Sales Contract Seller
    const sellerPartner = contract.seller;
    const company = shipment.company || contract.company;
    const sellerDetails = {
      name:
        sellerPartner?.entityName ||
        company?.legalName ||
        company?.name ||
        'AGRICOM IMPEX',
      address:
        sellerPartner?.address ||
        (company?.name?.toUpperCase().includes('AGRICOM') || company?.legalName?.toUpperCase().includes('AGRICOM')
          ? '202, 2ND FLOOR,\nAMALTAS APPT, RAJNAGAR,\nNAGPUR, MAHARASHTRA 440013\nMAHARASHTRA , INDIA'
          : (company?.address
              ? [company?.address, company?.city, company?.state, company?.country, company?.pincode]
                  .filter(Boolean)
                  .join(', ')
              : '202, 2ND FLOOR,\nAMALTAS APPT, RAJNAGAR,\nNAGPUR, MAHARASHTRA 440013\nMAHARASHTRA , INDIA')),
      country: sellerPartner?.country || company?.country || contract.originCountry || 'INDIA',
      taxId: sellerPartner?.taxId || company?.taxNumber || 'I.E.C. NO.0307027422',
      contactEmail: sellerPartner?.contactEmail || company?.email || '',
      phone: company?.phone || '',
    };

    // Consignee: Sales Contract Buyer
    const buyerPartner = contract.buyer;
    const consigneeDetails = {
      name: buyerPartner?.entityName || 'Consignee Name',
      address:
        buyerPartner?.address ||
        buyerPartner?.loadingAddress ||
        [buyerPartner?.city, buyerPartner?.country].filter(Boolean).join(', ') ||
        '',
      country: buyerPartner?.country || contract.destinationCountry || '',
      taxId: buyerPartner?.taxId || '',
      contactEmail: buyerPartner?.contactEmail || '',
      phone: buyerPartner?.contacts?.[0]?.phone || '',
    };

    // Notify Party: Same as Buyer by default
    const notifyPartyDetails = {
      ...consigneeDetails,
    };

    // 4. Goods Table Data Mapping
    const contractItems = contract.items || [];
    const goodsItems = contractItems.map((item: any, idx: number) => {
      const product = item.product || {};
      const packing = item.packingType?.name || 'Bags';
      const bagSpec = item.bagSpecification?.name || '';
      const bagSize = Number(item.bagSpecification?.size || 50);

      const qty = Number(shipment.quantity || item.quantity || 0);
      const rate = Number(item.unitPrice || 0);
      const amount = parseFloat((qty * rate).toFixed(2));

      // Calculate package count if bags
      let packageText = '';
      if (bagSize > 0 && qty > 0) {
        const bagCount = Math.round((qty * 1000) / bagSize);
        packageText = `${bagCount} BAGS\nPACKING:\n${packing.toUpperCase()}`;
      } else {
        packageText = `22 BAGS\nPACKING:\nBIG BAGS`;
      }

      const containerStr =
        containerNumbers.length > 0
          ? containerNumbers.join(', ')
          : shipment.noOfContainers
            ? `${shipment.noOfContainers} Container(s)`
            : '';

      const truckPart =
        truckNumbers.length > 0 ? `\n\nTRUCK NO:\n${truckNumbers.join('\n')}` : '';
      const marksAndNos = `${item.marking || 'BIG BAGS'}${truckPart}`;

      const truckPrefix =
        truckNumbers.length > 0 ? `${truckNumbers.length} TRUCK CONTAIN\n` : '';
      const descriptionOfGoods = `${truckPrefix}${product.name || 'COMMODITY'}\n${item.quality ? item.quality + '\n' : ''}${item.origin ? item.origin + ' ORIGIN' : 'KAZAK ORIGIN'}`.trim();

      return {
        id: item.id || idx + 1,
        marksAndNos,
        containerNo: containerStr,
        noAndKindOfPackages: packageText,
        descriptionOfGoods,
        quantity: qty,
        quantityUnit: 'MT',
        rate: rate,
        amount: amount,
      };
    });

    if (goodsItems.length === 0) {
      const qty = Number(shipment.quantity || 0);
      goodsItems.push({
        id: 1,
        marksAndNos: 'AS PER CONTRACT',
        containerNo: containerNumbers.join(', ') || '—',
        noAndKindOfPackages: 'IN BULK',
        descriptionOfGoods: 'AGRICULTURAL COMMODITIES',
        quantity: qty,
        quantityUnit: 'MT',
        rate: 0,
        amount: 0,
      });
    }

    const currency = contract.currencyCode || 'USD';
    const totalQuantity = goodsItems.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
    const totalAmount = goodsItems.reduce((acc, it) => acc + Number(it.amount || 0), 0);
    const amountInWords = convertAmountToWords(totalAmount, currency);

    // 5. Terms of Delivery & Payment (matching physical document layout with line breaks)
    const rawContract = contract as any;
    const paymentTermName =
      rawContract.paymentTerm?.name || '100% PAYMENT WITHIN 1 DAY AFTER DELIVERY';
    const incoterm =
      rawContract.incoterm ||
      rawContract.termsOfDelivery ||
      rawContract.deliveryTerm ||
      contract.shipmentType?.code ||
      contract.contractType ||
      '';
    const deliveryPlace =
      rawContract.deliveryPlace ||
      rawContract.destinationLocationName ||
      rawContract.portOfDischarge ||
      rawContract.destinationCountry ||
      '';
    const deliveryTermsStr = [incoterm, deliveryPlace].filter(Boolean).join(' ');
    const termsOfDeliveryPayment = [paymentTermName, deliveryTermsStr]
      .filter(Boolean)
      .join('\n');

    // 6. Bank Details dropdown with dummy options
    const availableBanks = await this.bankProvider.getAvailableBanks(currency);
    const defaultBank = availableBanks[0] || null;

    // 7. Preview next invoice number
    const companyId = shipment.companyId || contract.companyId || (user?.companyId ?? null);
    const nextNumberInfo = await this.invoiceNumberService.previewNextNumber(
      companyId,
      contract.contractNumber,
    );

    // 8. Signature & stamp defaults
    const signatures = await this.signatureProvider.getSignaturesForCompany(companyId);

    // Current system date YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    const businessRef =
      shipment.businessTransaction?.businessReference ||
      contract.businessTransaction?.businessReference ||
      shipment.shipmentReference ||
      '';

    return {
      shipmentId: shipment.id,
      salesContractId: contract.id,
      purchaseContractId: purchaseContract?.id || null,
      companyId,
      invoiceNumber: nextNumberInfo.invoiceNumber,
      sequenceNumber: nextNumberInfo.sequenceNumber,
      isManualFirstSequence: nextNumberInfo.isManualFirstSequence,
      invoiceDate: today,
      status: 'Draft',
      businessReference: businessRef,
      exporterRef: 'I.E.C. NO.0307027422',
      sellerOrderNo: contract.contractNumber,
      sellerOrderDate: contract.contractDate
        ? String(contract.contractDate).split('T')[0]
        : today,
      otherRef: '',
      buyerOrderNo: contract.enquiryId ? `ENQ-${contract.enquiryId.substring(0, 8)}` : '',
      buyerOrderDate: null,
      sellerDetails,
      consigneeDetails,
      notifyPartyDetails,
      buyerOtherThanConsignee: null,
      countryOfOrigin: contract.originCountry
        ? contract.originCountry.toUpperCase()
        : 'KAZAKHSTAN',
      countryOfFinalDestination: contract.destinationCountry
        ? contract.destinationCountry.toUpperCase()
        : '',
      termsOfDeliveryPayment,
      carriageBy: 'ROAD',
      placeOfLoading,
      placeOfUnloading:
        contract.destinationLocationName ||
        contract.portOfDischarge ||
        contract.deliveryPlace ||
        '',
      finalDestination:
        contract.destinationCountry ||
        contract.deliveryPlace ||
        '',
      truckNumbers,
      containerNumbers,
      goodsItems,
      currency,
      totalQuantity,
      totalAmount,
      amountChargeable: totalAmount,
      amountInWords,
      bankKey: defaultBank?.key || null,
      bankDetails: defaultBank?.details || null,
      availableBanks,
      declaration: 'WE HEREBY CERTIFY THAT THE GOODS SUPPLIED ARE OF 100% KAZAKHSTAN ORIGIN.',
      signatureUrl: signatures.signatureUrl || null,
      stampUrl: signatures.stampUrl || null,
      signatoryName: signatures.signatoryName || 'Authorized Signatory',
      signatoryDesignation: signatures.signatoryDesignation || 'Director',
      remarks: '',
      metadata: {
        businessReference: businessRef,
      },
    };
  }

  private async findExistingInvoiceForStuffingGroup(
    stuffingGroupId?: number | null,
  ): Promise<ExportInvoice | null> {
    if (
      !stuffingGroupId ||
      !this.invoiceStuffingGroupModel ||
      typeof this.invoiceStuffingGroupModel.findAll !== 'function' ||
      typeof this.invoiceModel?.findByPk !== 'function'
    ) {
      return null;
    }

    const links = await this.invoiceStuffingGroupModel.findAll({
      where: { stuffingGroupId: Number(stuffingGroupId) },
      order: [['id', 'ASC']],
    });
    for (const link of links || []) {
      const invId = Number((link as any)?.exportInvoiceId);
      if (!invId) continue;
      const existing = await this.invoiceModel.findByPk(invId);
      if (existing) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Initializes a combined Export Invoice from a StuffingExecutionGroup (multi-shipment).
   * Single-shipment initFromShipment remains completely untouched.
   */
  async initFromStuffingGroup(stuffingGroupId: number, user?: any) {
    if (
      !this.stuffingGroupModel ||
      typeof this.stuffingGroupModel.findByPk !== 'function'
    ) {
      throw new BadRequestException(
        'Stuffing execution grouping is not available.',
      );
    }

    const group = await this.stuffingGroupModel.findByPk(stuffingGroupId, {
      include: [
        {
          model: StuffingExecutionGroupItem,
          as: 'items',
          required: false,
          include: [
            {
              model: SalesContractShipment,
              as: 'shipment',
              required: false,
              include: [
                {
                  model: SalesContract,
                  as: 'salesContract',
                  include: [
                    { model: Partner, as: 'buyer' },
                    { model: Partner, as: 'seller' },
                    { model: Company, as: 'company' },
                    { model: PaymentTerm, as: 'paymentTerm' },
                    { model: ShipmentType, as: 'shipmentType' },
                    {
                      model: SalesContractItem,
                      as: 'items',
                      include: [
                        { model: Product, as: 'product' },
                        { model: BagType, as: 'bagType' },
                        { model: PackingType, as: 'packingType' },
                        {
                          model: BagSpecification,
                          as: 'bagSpecification',
                          include: [
                            { model: BagType, as: 'bagType' },
                            { model: PackingType, as: 'packingType' },
                          ],
                        },
                      ],
                    },
                  ],
                },
                { model: ShipmentStuffing, as: 'stuffingExecution' },
                { model: BusinessTransaction, as: 'businessTransaction' },
                { model: Company, as: 'company' },
              ],
            },
            {
              model: ShipmentStuffing,
              as: 'shipmentStuffing',
              required: false,
            },
          ],
        },
      ],
    });

    if (!group) {
      throw new NotFoundException(
        `Stuffing Execution Group #${stuffingGroupId} not found`,
      );
    }

    const orderedItems = (group.items || [])
      .slice()
      .sort(
        (a: any, b: any) =>
          Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0),
      );
    const orderedShipments = orderedItems
      .map((it: any) => it.shipment)
      .filter(Boolean);

    if (orderedShipments.length === 0) {
      throw new BadRequestException(
        `Stuffing Execution Group #${stuffingGroupId} has no linked shipments`,
      );
    }

    if (orderedShipments.length === 1) {
      return this.initFromShipment(orderedShipments[0].id, user);
    }

    const existingInvoice = await this.findExistingInvoiceForStuffingGroup(
      Number(group.id || stuffingGroupId),
    );
    if (existingInvoice) {
      return {
        existingInvoiceId: existingInvoice.id,
        existingInvoiceNumber: existingInvoice.invoiceNumber,
        isMultiShipment: true,
        stuffingGroupId: Number(group.id || stuffingGroupId),
        stuffingGroupReference: group.groupReference || null,
      };
    }

    const stuffingByShipmentId = new Map<number, ShipmentStuffing>();
    for (const item of orderedItems as any[]) {
      const s = item.shipment;
      const st = item.shipmentStuffing || s?.stuffingExecution || null;
      if (s?.id && st) {
        stuffingByShipmentId.set(Number(s.id), st);
      }
    }

    return this.buildCombinedInitPayload(
      orderedShipments,
      stuffingByShipmentId,
      user,
      group,
    );
  }

  /**
   * Initializes a combined Export Invoice from multiple shipmentIds.
   * Delegates to single-shipment initFromShipment if only 1 shipmentId is provided.
   */
  async initFromMultiShipments(
    rawShipmentIds: string | number[],
    user?: any,
  ) {
    const rawList = Array.isArray(rawShipmentIds)
      ? rawShipmentIds
      : typeof rawShipmentIds === 'string'
        ? rawShipmentIds.split(',').map((s) => s.trim())
        : [];
    const shipmentIds = Array.from(
      new Set(
        rawList
          .map((v) => Number(v))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    );

    if (shipmentIds.length === 0) {
      throw new BadRequestException(
        'At least one valid shipmentId is required to initialize invoice.',
      );
    }

    if (shipmentIds.length === 1) {
      return this.initFromShipment(shipmentIds[0], user);
    }

    const shipments = await this.shipmentModel.findAll({
      where: { id: { [Op.in]: shipmentIds } },
      include: [
        {
          model: SalesContract,
          as: 'salesContract',
          include: [
            { model: Partner, as: 'buyer' },
            { model: Partner, as: 'seller' },
            { model: Company, as: 'company' },
            { model: PaymentTerm, as: 'paymentTerm' },
            { model: ShipmentType, as: 'shipmentType' },
            {
              model: SalesContractItem,
              as: 'items',
              include: [
                { model: Product, as: 'product' },
                { model: BagType, as: 'bagType' },
                { model: PackingType, as: 'packingType' },
                {
                  model: BagSpecification,
                  as: 'bagSpecification',
                  include: [
                    { model: BagType, as: 'bagType' },
                    { model: PackingType, as: 'packingType' },
                  ],
                },
              ],
            },
          ],
        },
        { model: ShipmentStuffing, as: 'stuffingExecution' },
        { model: BusinessTransaction, as: 'businessTransaction' },
        { model: Company, as: 'company' },
      ],
    });

    const byId = new Map<number, SalesContractShipment>(
      shipments.map((s) => [Number(s.id), s]),
    );
    const orderedShipments = shipmentIds
      .map((id) => byId.get(id))
      .filter((s): s is SalesContractShipment => Boolean(s));

    if (orderedShipments.length !== shipmentIds.length) {
      const missingId = shipmentIds.find((id) => !byId.has(id));
      throw new NotFoundException(`Shipment #${missingId} not found`);
    }

    let matchedGroup: StuffingExecutionGroup | null = null;
    if (
      this.stuffingGroupItemModel &&
      this.stuffingGroupModel &&
      typeof this.stuffingGroupItemModel.findAll === 'function'
    ) {
      try {
        const groupItems = await this.stuffingGroupItemModel.findAll({
          where: { shipmentId: { [Op.in]: shipmentIds } },
        });
        const gIds = Array.from(
          new Set(
            (groupItems || [])
              .map((gi: any) => Number(gi.stuffingGroupId))
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          ),
        );
        if (gIds.length === 1 && groupItems.length === shipmentIds.length) {
          matchedGroup = await this.stuffingGroupModel.findByPk(gIds[0]);
        }
      } catch (e) {
        this.logger.warn(
          `Could not resolve StuffingExecutionGroup for shipments: ${e.message}`,
        );
      }
    }

    if (matchedGroup?.id) {
      const existingInvoice = await this.findExistingInvoiceForStuffingGroup(
        matchedGroup.id,
      );
      if (existingInvoice) {
        return {
          existingInvoiceId: existingInvoice.id,
          existingInvoiceNumber: existingInvoice.invoiceNumber,
          isMultiShipment: true,
          stuffingGroupId: matchedGroup.id,
          stuffingGroupReference: matchedGroup.groupReference || null,
        };
      }
    }

    const stuffingByShipmentId = new Map<number, ShipmentStuffing>();
    for (const s of orderedShipments) {
      if (s.stuffingExecution) {
        stuffingByShipmentId.set(Number(s.id), s.stuffingExecution);
      }
    }
    if (stuffingByShipmentId.size < orderedShipments.length) {
      const extraStuffings = await this.stuffingModel.findAll({
        where: { shipmentId: { [Op.in]: shipmentIds } },
      });
      for (const st of extraStuffings || []) {
        if (!stuffingByShipmentId.has(Number(st.shipmentId))) {
          stuffingByShipmentId.set(Number(st.shipmentId), st);
        }
      }
    }

    return this.buildCombinedInitPayload(
      orderedShipments,
      stuffingByShipmentId,
      user,
      matchedGroup,
    );
  }

  private async buildCombinedInitPayload(
    orderedShipments: SalesContractShipment[],
    stuffingByShipmentId: Map<number, ShipmentStuffing>,
    user?: any,
    stuffingGroup?: StuffingExecutionGroup | null,
  ) {
    const primaryShipment = orderedShipments[0];
    const contractIds = new Set(
      orderedShipments.map((s) => Number(s.salesContractId || 0)),
    );
    if (contractIds.has(0) || contractIds.size !== 1) {
      throw new BadRequestException(
        'Combined Export Invoice is allowed only for shipments belonging to the same Sales Contract.',
      );
    }

    const contract = primaryShipment.salesContract;
    if (!contract) {
      throw new BadRequestException(
        `Shipment #${primaryShipment.id} has no associated Sales Contract`,
      );
    }

    if (
      user?.companyId &&
      contract.companyId &&
      contract.companyId !== user.companyId
    ) {
      throw new NotFoundException(`Shipment #${primaryShipment.id} not found`);
    }

    const shipmentIds = orderedShipments.map((s) => Number(s.id));

    // 1. Trace Purchase Contract across selected shipments for Place of Loading
    let purchaseContract: any = null;
    let placeOfLoading = '';
    try {
      const pcShipmentLinks: any[] = await PurchaseContractShipment.findAll({
        where: { shipmentId: { [Op.in]: shipmentIds } },
      });
      const pcIds = Array.from(
        new Set(
          (pcShipmentLinks || [])
            .map((l) => Number(l?.purchaseContractId))
            .filter((id) => Number.isSafeInteger(id) && id > 0),
        ),
      );
      if (pcIds.length > 0) {
        const pcs = await this.purchaseContractModel.findAll({
          where: { id: { [Op.in]: pcIds } },
          order: [['updatedAt', 'DESC']],
        });
        purchaseContract =
          pcs.find((p) => Boolean(p?.placeOfLoading)) || pcs[0] || null;
      } else if (contract.id) {
        purchaseContract = await this.purchaseContractModel.findOne({
          where: { salesContractId: contract.id },
          order: [['updatedAt', 'DESC']],
        });
      }

      if (purchaseContract?.placeOfLoading) {
        placeOfLoading = purchaseContract.placeOfLoading;
      }
    } catch (e) {
      this.logger.warn(
        `Could not trace Purchase Contract for combined shipments [${shipmentIds.join(',')}]: ${e.message}`,
      );
    }

    if (!placeOfLoading) {
      placeOfLoading =
        contract.originLocationName ||
        contract.portOfLoading ||
        contract.originCountry ||
        '';
    }

    // 2. Collect unique trucks and containers across all Stuffing Execution records
    const truckSet = new Set<string>();
    const containerSet = new Set<string>();
    for (const s of orderedShipments) {
      const st = stuffingByShipmentId.get(Number(s.id));
      if (!st) continue;
      if (Array.isArray(st.trucks)) {
        st.trucks.forEach((t: any) => {
          if (t?.truckNo?.trim()) truckSet.add(t.truckNo.trim());
        });
      }
      if (Array.isArray(st.containers)) {
        st.containers.forEach((c: any) => {
          if (c?.containerNo?.trim()) containerSet.add(c.containerNo.trim());
        });
      }
    }
    const truckNumbers = Array.from(truckSet);
    const containerNumbers = Array.from(containerSet);

    // 3. Parties Mapping (from single Sales Contract)
    const sellerPartner = contract.seller;
    const company = primaryShipment.company || contract.company;
    const sellerDetails = {
      name:
        sellerPartner?.entityName ||
        company?.legalName ||
        company?.name ||
        'AGRICOM IMPEX',
      address:
        sellerPartner?.address ||
        (company?.name?.toUpperCase().includes('AGRICOM') ||
        company?.legalName?.toUpperCase().includes('AGRICOM')
          ? '202, 2ND FLOOR,\nAMALTAS APPT, RAJNAGAR,\nNAGPUR, MAHARASHTRA 440013\nMAHARASHTRA , INDIA'
          : company?.address
            ? [
                company?.address,
                company?.city,
                company?.state,
                company?.country,
                company?.pincode,
              ]
                .filter(Boolean)
                .join(', ')
            : '202, 2ND FLOOR,\nAMALTAS APPT, RAJNAGAR,\nNAGPUR, MAHARASHTRA 440013\nMAHARASHTRA , INDIA'),
      country:
        sellerPartner?.country ||
        company?.country ||
        contract.originCountry ||
        'INDIA',
      taxId:
        sellerPartner?.taxId ||
        company?.taxNumber ||
        'I.E.C. NO.0307027422',
      contactEmail: sellerPartner?.contactEmail || company?.email || '',
      phone: company?.phone || '',
    };

    const buyerPartner = contract.buyer;
    const consigneeDetails = {
      name: buyerPartner?.entityName || 'Consignee Name',
      address:
        buyerPartner?.address ||
        buyerPartner?.loadingAddress ||
        [buyerPartner?.city, buyerPartner?.country]
          .filter(Boolean)
          .join(', ') ||
        '',
      country: buyerPartner?.country || contract.destinationCountry || '',
      taxId: buyerPartner?.taxId || '',
      contactEmail: buyerPartner?.contactEmail || '',
      phone: buyerPartner?.contacts?.[0]?.phone || '',
    };

    const notifyPartyDetails = {
      ...consigneeDetails,
    };

    // 4. Goods Table: Aggregate rows with identical commercial attributes
    // Merge into ONE row when Product, Bag Type, Packing Type, Container Type,
    // Unit Price, and commercial values are identical; split only when they differ.
    const currency = contract.currencyCode || 'USD';
    const transportModeNorm = normalizeTransportMode(
      stuffingGroup?.transportCategory ||
        contract.originTransportMode ||
        contract.transportMode ||
        'sea',
    );
    const allShipmentRefs = orderedShipments.map(
      (s) => s.shipmentReference || `SHP-${s.id}`,
    );

    const buildPackagesText = (
      totalBags: number,
      bagTypeName: string,
      packingTypeName: string,
    ): string => {
      if (totalBags <= 0) return 'IN BULK';
      const lines = [`${totalBags} BAGS`, 'PACKING:'];
      const bagUpper = bagTypeName.trim().toUpperCase();
      const packUpper = packingTypeName.trim().toUpperCase();
      if (bagUpper) lines.push(bagUpper);
      if (packUpper) {
        lines.push(packUpper === 'BULK' ? 'IN BULK' : `OF ${packUpper} EACH`);
      }
      return lines.join('\n');
    };

    const buildDescriptionText = (
      unitCount: number,
      containerTypeLabel: string,
      productName: string,
      qtyMt: number,
    ): string => {
      const productUpper = (productName || 'COMMODITY').trim().toUpperCase();
      const containerUpper = (containerTypeLabel || '20 FT')
        .trim()
        .toUpperCase();
      if (transportModeNorm === 'BULK') {
        return `${qtyMt} MT IN BULK\nOF\n${productUpper}`;
      }
      if (transportModeNorm === 'ROAD') {
        return `${unitCount} ${unitCount === 1 ? 'TRUCK' : 'TRUCKS'}\nOF\n${productUpper}`;
      }
      if (transportModeNorm === 'RAIL') {
        return `${unitCount} ${unitCount === 1 ? 'WAGON' : 'WAGONS'}\nOF\n${productUpper}`;
      }
      if (transportModeNorm === 'AIR') {
        return `${unitCount} ${unitCount === 1 ? 'AIR SHIPMENT' : 'AIR SHIPMENTS'}\nOF\n${productUpper}`;
      }
      return `${unitCount} × ${containerUpper} ${unitCount === 1 ? 'CONTAINER' : 'CONTAINERS'}\nOF\n${productUpper}`;
    };

    const formatMarksForShipments = (markingText: string): string => {
      const clean = String(markingText || '').trim();
      return clean ? clean.toUpperCase() : '';
    };

    interface AggregatedContractItemGroup {
      key: string;
      productName: string;
      bagTypeName: string;
      packingTypeName: string;
      containerTypeLabel: string;
      unitPrice: number;
      bagSize: number;
      markingText: string;
      contractItemQty: number;
    }

    const contractItems = contract.items || [];
    const printOverrides = (contract as any).printOverrides || {};
    const mergedItemGroupMap = new Map<string, AggregatedContractItemGroup>();
    for (let itemIdx = 0; itemIdx < contractItems.length; itemIdx++) {
      const it: any = contractItems[itemIdx];
      const productName = String(it?.product?.name || 'COMMODITY').trim();
      const productKey = String(it?.productId || productName)
        .trim()
        .toUpperCase();
      const bagTypeName = String(
        it?.bagType?.name || it?.bagSpecification?.bagType?.name || '',
      ).trim();
      const bagTypeKey = String(it?.bagTypeId || bagTypeName)
        .trim()
        .toUpperCase();
      const packingTypeName = String(
        it?.packingType?.name || it?.bagSpecification?.packingType?.name || '',
      ).trim();
      const packingTypeKey = String(it?.packingTypeId || packingTypeName)
        .trim()
        .toUpperCase();
      const containerTypeLabel = String(
        it?.containerType || contract.containerType || '20 FT',
      )
        .trim()
        .toUpperCase();
      const containerKey =
        transportModeNorm === 'SEA' || transportModeNorm === 'OTHER'
          ? containerTypeLabel
          : transportModeNorm;
      const unitPrice = Number(it?.unitPrice || 0);
      const qualityKey = String(it?.quality || '')
        .trim()
        .toUpperCase();
      const originKey = String(it?.origin || contract.originCountry || '')
        .trim()
        .toUpperCase();
      const overrideMarking =
        printOverrides[`marking_${itemIdx}`] ??
        (itemIdx === 0 ? printOverrides.marking_0 : '');
      const markingText = String(it?.marking || overrideMarking || '').trim();
      const bagSize = Number(it?.bagSpecification?.size || 50);

      const sig = [
        contract.id,
        productKey,
        bagTypeKey,
        packingTypeKey,
        containerKey,
        unitPrice.toFixed(4),
        currency,
        qualityKey,
        originKey,
        markingText.toUpperCase(),
      ].join('||');

      const existingGroup = mergedItemGroupMap.get(sig);
      if (existingGroup) {
        existingGroup.contractItemQty += Number(it?.quantity || 0);
      } else {
        mergedItemGroupMap.set(sig, {
          key: sig,
          productName,
          bagTypeName,
          packingTypeName,
          containerTypeLabel,
          unitPrice,
          bagSize: bagSize > 0 ? bagSize : 50,
          markingText,
          contractItemQty: Number(it?.quantity || 0),
        });
      }
    }

    const mergedItemGroups = Array.from(mergedItemGroupMap.values());
    let goodsItems: any[] = [];

    if (mergedItemGroups.length <= 1) {
      const baseGroup: AggregatedContractItemGroup = mergedItemGroups[0] || {
        key: 'default',
        productName: 'COMMODITY',
        bagTypeName: '',
        packingTypeName: '',
        containerTypeLabel: String(contract.containerType || '20 FT')
          .trim()
          .toUpperCase(),
        unitPrice: Number(primaryShipment.ratePerMt || 0),
        bagSize: 50,
        markingText: '',
        contractItemQty: 0,
      };

      const bucketsByRate = new Map<string, SalesContractShipment[]>();
      for (const sh of orderedShipments) {
        const effectiveRate =
          sh.ratePerMt != null && Number(sh.ratePerMt) > 0
            ? Number(sh.ratePerMt)
            : baseGroup.unitPrice;
        const rateKey = effectiveRate.toFixed(4);
        if (!bucketsByRate.has(rateKey)) {
          bucketsByRate.set(rateKey, []);
        }
        bucketsByRate.get(rateKey)!.push(sh);
      }

      const rateBuckets = Array.from(bucketsByRate.entries());
      goodsItems = rateBuckets.map(([rateKey, bucketShipments], bucketIdx) => {
        const rate = Number(rateKey);
        const qty = parseFloat(
          bucketShipments
            .reduce((sum, s) => sum + Number(s.quantity || 0), 0)
            .toFixed(3),
        );
        const totalBags = bucketShipments.reduce((sum, s) => {
          const shQty = Number(s.quantity || 0);
          return (
            sum +
            (baseGroup.bagSize > 0 && shQty > 0
              ? Math.round((shQty * 1000) / baseGroup.bagSize)
              : 0)
          );
        }, 0);
        const containerCount = bucketShipments.reduce(
          (sum, s) =>
            sum + (Number(s.noOfContainers) > 0 ? Number(s.noOfContainers) : 1),
          0,
        );
        const refsInBucket = bucketShipments.map(
          (s) => s.shipmentReference || `SHP-${s.id}`,
        );
        const amount = parseFloat((qty * rate).toFixed(2));

        return {
          id: `group-${stuffingGroup?.id || primaryShipment.id}-${bucketIdx + 1}`,
          shipmentId: bucketShipments[0]?.id || primaryShipment.id,
          shipmentReference: refsInBucket.join(', '),
          shipmentReferences: refsInBucket,
          marksAndNos: formatMarksForShipments(baseGroup.markingText),
          containerNo: '',
          noAndKindOfPackages: buildPackagesText(
            totalBags,
            baseGroup.bagTypeName,
            baseGroup.packingTypeName,
          ),
          descriptionOfGoods: buildDescriptionText(
            containerCount,
            baseGroup.containerTypeLabel,
            baseGroup.productName,
            qty,
          ),
          quantity: qty,
          quantityUnit: 'MT',
          rate,
          amount,
        };
      });
    } else {
      const totalSelectedQty = orderedShipments.reduce(
        (sum, s) => sum + Number(s.quantity || 0),
        0,
      );
      const totalContractItemQty = mergedItemGroups.reduce(
        (sum, g) => sum + Number(g.contractItemQty || 0),
        0,
      );
      const totalShipmentContainers = orderedShipments.reduce(
        (sum, s) =>
          sum + (Number(s.noOfContainers) > 0 ? Number(s.noOfContainers) : 1),
        0,
      );

      let remainingQty = parseFloat(totalSelectedQty.toFixed(3));
      goodsItems = mergedItemGroups.map((grp, grpIdx) => {
        const share =
          totalContractItemQty > 0
            ? grp.contractItemQty / totalContractItemQty
            : 1 / mergedItemGroups.length;
        const qty =
          grpIdx === mergedItemGroups.length - 1
            ? Math.max(0, parseFloat(remainingQty.toFixed(3)))
            : parseFloat((totalSelectedQty * share).toFixed(3));
        remainingQty = parseFloat((remainingQty - qty).toFixed(3));

        const totalBags =
          grp.bagSize > 0 && qty > 0
            ? Math.round((qty * 1000) / grp.bagSize)
            : 0;
        const unitCount = Math.max(
          1,
          Math.round(totalShipmentContainers * share),
        );
        const amount = parseFloat((qty * grp.unitPrice).toFixed(2));

        return {
          id: `group-${stuffingGroup?.id || primaryShipment.id}-${grpIdx + 1}`,
          shipmentId: primaryShipment.id,
          shipmentReference: allShipmentRefs.join(', '),
          shipmentReferences: allShipmentRefs,
          marksAndNos: formatMarksForShipments(grp.markingText),
          containerNo: '',
          noAndKindOfPackages: buildPackagesText(
            totalBags,
            grp.bagTypeName,
            grp.packingTypeName,
          ),
          descriptionOfGoods: buildDescriptionText(
            unitCount,
            grp.containerTypeLabel,
            grp.productName,
            qty,
          ),
          quantity: qty,
          quantityUnit: 'MT',
          rate: grp.unitPrice,
          amount,
        };
      });
    }

    const totalQuantity = goodsItems.reduce(
      (acc, it) => acc + Number(it.quantity || 0),
      0,
    );
    const totalAmount = goodsItems.reduce(
      (acc, it) => acc + Number(it.amount || 0),
      0,
    );
    const amountInWords = convertAmountToWords(totalAmount, currency);

    // 5. Terms of Delivery & Payment
    const rawContract = contract as any;
    const paymentTermName =
      rawContract.paymentTerm?.name ||
      '100% PAYMENT WITHIN 1 DAY AFTER DELIVERY';
    const incoterm =
      rawContract.incoterm ||
      rawContract.termsOfDelivery ||
      rawContract.deliveryTerm ||
      contract.shipmentType?.code ||
      contract.contractType ||
      '';
    const deliveryPlace =
      rawContract.deliveryPlace ||
      rawContract.destinationLocationName ||
      rawContract.portOfDischarge ||
      rawContract.destinationCountry ||
      '';
    const deliveryTermsStr = [incoterm, deliveryPlace]
      .filter(Boolean)
      .join(' ');
    const termsOfDeliveryPayment = [paymentTermName, deliveryTermsStr]
      .filter(Boolean)
      .join('\n');

    const modeStr = String(
      stuffingGroup?.transportCategory ||
        contract.originTransportMode ||
        contract.transportMode ||
        '',
    )
      .trim()
      .toUpperCase();
    const carriageBy =
      modeStr.includes('RAIL') || modeStr.includes('WAGON')
        ? 'RAIL'
        : modeStr.includes('AIR')
          ? 'AIR'
          : modeStr.includes('SEA') ||
              modeStr.includes('OCEAN') ||
              modeStr.includes('CONTAINER')
            ? 'SEA'
            : 'ROAD';

    // 6. Bank Details & Invoice Number & Signatures
    const availableBanks = await this.bankProvider.getAvailableBanks(currency);
    const defaultBank = availableBanks[0] || null;
    const companyId =
      primaryShipment.companyId ||
      contract.companyId ||
      (user?.companyId ?? null);
    const nextNumberInfo = await this.invoiceNumberService.previewNextNumber(
      companyId,
      contract.contractNumber,
    );
    const signatures =
      await this.signatureProvider.getSignaturesForCompany(companyId);
    const today = new Date().toISOString().split('T')[0];

    const shipmentReferences = orderedShipments.map(
      (s) => s.shipmentReference || `SHP-${s.id}`,
    );
    const businessRefs = Array.from(
      new Set(
        orderedShipments
          .map(
            (s) =>
              s.businessTransaction?.businessReference ||
              contract.businessTransaction?.businessReference,
          )
          .filter(Boolean),
      ),
    );
    const businessRef =
      businessRefs.length > 0
        ? businessRefs.join(', ')
        : shipmentReferences[0] || '';

    return {
      isMultiShipment: true,
      stuffingGroupId: stuffingGroup?.id || null,
      stuffingGroupReference: stuffingGroup?.groupReference || null,
      shipmentIds,
      shipmentReferences,
      shipmentId: primaryShipment.id,
      salesContractId: contract.id,
      purchaseContractId: purchaseContract?.id || null,
      companyId,
      invoiceNumber: nextNumberInfo.invoiceNumber,
      sequenceNumber: nextNumberInfo.sequenceNumber,
      isManualFirstSequence: nextNumberInfo.isManualFirstSequence,
      invoiceDate: today,
      status: 'Draft',
      businessReference: businessRef,
      exporterRef: 'I.E.C. NO.0307027422',
      sellerOrderNo: contract.contractNumber,
      sellerOrderDate: contract.contractDate
        ? String(contract.contractDate).split('T')[0]
        : today,
      otherRef: '',
      buyerOrderNo: contract.enquiryId
        ? `ENQ-${contract.enquiryId.substring(0, 8)}`
        : '',
      buyerOrderDate: null,
      sellerDetails,
      consigneeDetails,
      notifyPartyDetails,
      buyerOtherThanConsignee: null,
      countryOfOrigin: contract.originCountry
        ? contract.originCountry.toUpperCase()
        : 'KAZAKHSTAN',
      countryOfFinalDestination: contract.destinationCountry
        ? contract.destinationCountry.toUpperCase()
        : '',
      termsOfDeliveryPayment,
      carriageBy,
      placeOfLoading,
      placeOfUnloading:
        contract.destinationLocationName ||
        contract.portOfDischarge ||
        contract.deliveryPlace ||
        '',
      finalDestination:
        contract.destinationCountry || contract.deliveryPlace || '',
      truckNumbers,
      containerNumbers,
      goodsItems,
      currency,
      totalQuantity,
      totalAmount,
      amountChargeable: totalAmount,
      amountInWords,
      bankKey: defaultBank?.key || null,
      bankDetails: defaultBank?.details || null,
      availableBanks,
      declaration:
        'WE HEREBY CERTIFY THAT THE GOODS SUPPLIED ARE OF 100% KAZAKHSTAN ORIGIN.',
      signatureUrl: signatures.signatureUrl || null,
      stampUrl: signatures.stampUrl || null,
      signatoryName: signatures.signatoryName || 'Authorized Signatory',
      signatoryDesignation: signatures.signatoryDesignation || 'Director',
      remarks: '',
      metadata: {
        businessReference: businessRef,
        isMultiShipment: true,
        stuffingGroupId: stuffingGroup?.id || null,
        stuffingGroupReference: stuffingGroup?.groupReference || null,
        shipmentIds,
        shipmentReferences,
      },
    };
  }

  /**
   * Creates and stores a new Export Invoice in the database
   */
  async create(dto: CreateExportInvoiceDto, user?: any) {
    const companyId = dto.companyId || (user?.companyId ?? null);

    // Auto calculate totals if not provided or to ensure arithmetic accuracy
    let totalQty = 0;
    let totalAmt = 0;

    const goods = (dto.goodsItems || []).map((item) => {
      const q = Number(item.quantity || 0);
      const r = Number(item.rate || 0);
      const a = parseFloat((q * r).toFixed(2));
      totalQty += q;
      totalAmt += a;
      return {
        ...item,
        quantity: q,
        rate: r,
        amount: a,
      };
    });

    const currency = (dto.currency || 'USD').toUpperCase();
    const finalTotalAmount = dto.totalAmount !== undefined ? Number(dto.totalAmount) : totalAmt;
    const finalTotalQty = dto.totalQuantity !== undefined ? Number(dto.totalQuantity) : totalQty;
    const amountChargeable = dto.amountChargeable !== undefined ? Number(dto.amountChargeable) : finalTotalAmount;
    const words = dto.amountInWords || convertAmountToWords(amountChargeable, currency);

    // Bank details resolution
    let bankDetails = dto.bankDetails;
    if (!bankDetails && dto.bankKey) {
      const opt = await this.bankProvider.getBankByKey(dto.bankKey);
      if (opt) bankDetails = opt.details;
    }
    if (bankDetails) {
      const formatted = bankDetails.formattedText || bankDetails.bankDetailsText || bankDetails.additionalDetails || '';
      bankDetails = {
        ...bankDetails,
        formattedText: formatted,
        bankDetailsText: formatted,
        additionalDetails: formatted,
      };
    }

    // Contract number resolution for invoice number formatting
    let contractNumber = dto.sellerOrderNo;
    if (!contractNumber && dto.salesContractId) {
      const sc = await this.contractModel.findByPk(dto.salesContractId);
      if (sc) contractNumber = sc.contractNumber;
    }

    // Allocate invoice number & sequence
    let invoiceNumber = dto.invoiceNumber;
    let sequenceNumber = dto.sequenceNumber || 0;

    if (!invoiceNumber) {
      const consumed = await this.invoiceNumberService.consumeNextNumber(
        companyId,
        contractNumber || 'SC000000',
        dto.sequenceNumber,
      );
      invoiceNumber = consumed.invoiceNumber;
      sequenceNumber = consumed.sequenceNumber;
    } else {
      // If user supplied an explicit invoice number, update sequence if greater
      if (dto.sequenceNumber) {
        await this.invoiceNumberService.consumeNextNumber(
          companyId,
          contractNumber || 'SC000000',
          dto.sequenceNumber,
        );
      }
    }

    let resolvedGroupShipmentIds: number[] = Array.isArray(dto.shipmentIds)
      ? Array.from(
          new Set(
            dto.shipmentIds
              .map((v) => Number(v))
              .filter((id) => Number.isSafeInteger(id) && id > 0),
          ),
        )
      : [];

    if (
      dto.stuffingGroupId &&
      resolvedGroupShipmentIds.length === 0 &&
      this.stuffingGroupItemModel &&
      typeof this.stuffingGroupItemModel.findAll === 'function'
    ) {
      const grpItems = await this.stuffingGroupItemModel.findAll({
        where: { stuffingGroupId: dto.stuffingGroupId },
        order: [['sequenceOrder', 'ASC']],
      });
      resolvedGroupShipmentIds = (grpItems || [])
        .map((it: any) => Number(it.shipmentId))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
    }

    const effectivePrimaryShipmentId =
      dto.shipmentId || resolvedGroupShipmentIds[0] || null;
    const isGroupedInvoice = Boolean(
      dto.stuffingGroupId || resolvedGroupShipmentIds.length > 1,
    );

    if (dto.stuffingGroupId) {
      const existingGroupInvoice =
        await this.findExistingInvoiceForStuffingGroup(dto.stuffingGroupId);
      if (existingGroupInvoice) {
        throw new BadRequestException(
          `A combined Export Invoice (${existingGroupInvoice.invoiceNumber}) already exists for Stuffing Execution Group #${dto.stuffingGroupId}.`,
        );
      }
    }

    let businessRef = dto.metadata?.businessReference;
    if (!businessRef && effectivePrimaryShipmentId) {
      try {
        const sh = await this.shipmentModel.findByPk(effectivePrimaryShipmentId, {
          include: [{ model: BusinessTransaction, as: 'businessTransaction' }],
        });
        businessRef = sh?.businessTransaction?.businessReference || sh?.shipmentReference;
      } catch (e) {
        this.logger.warn(`Could not resolve businessReference for shipment #${effectivePrimaryShipmentId}: ${e.message}`);
      }
    }
    if (!businessRef && dto.salesContractId) {
      try {
        const sc = await this.contractModel.findByPk(dto.salesContractId, {
          include: [{ model: BusinessTransaction, as: 'businessTransaction' }],
        });
        businessRef = sc?.businessTransaction?.businessReference;
      } catch (e) {
        this.logger.warn(`Could not resolve businessReference for contract #${dto.salesContractId}: ${e.message}`);
      }
    }

    const created = await this.invoiceModel.create({
      companyId,
      salesContractId: dto.salesContractId || null,
      shipmentId: effectivePrimaryShipmentId,
      purchaseContractId: dto.purchaseContractId || null,
      invoiceNumber,
      sequenceNumber,
      invoiceDate: dto.invoiceDate || new Date().toISOString().split('T')[0],
      status: dto.status || 'Draft',
      exporterRef: dto.exporterRef || 'I.E.C. NO.0307027422',
      sellerOrderNo: dto.sellerOrderNo || contractNumber || null,
      sellerOrderDate: dto.sellerOrderDate || null,
      otherRef: dto.otherRef || null,
      buyerOrderNo: dto.buyerOrderNo || null,
      buyerOrderDate: dto.buyerOrderDate || null,
      sellerDetails: dto.sellerDetails || null,
      consigneeDetails: dto.consigneeDetails || null,
      notifyPartyDetails: dto.notifyPartyDetails || null,
      buyerOtherThanConsignee: dto.buyerOtherThanConsignee || null,
      countryOfOrigin: dto.countryOfOrigin || 'Kazakhstan',
      countryOfFinalDestination: dto.countryOfFinalDestination || '',
      termsOfDeliveryPayment: dto.termsOfDeliveryPayment || '',
      carriageBy: dto.carriageBy || 'ROAD',
      placeOfLoading: dto.placeOfLoading || '',
      placeOfUnloading: dto.placeOfUnloading || '',
      finalDestination: dto.finalDestination || '',
      truckNumbers: dto.truckNumbers || [],
      containerNumbers: dto.containerNumbers || [],
      goodsItems: goods,
      currency,
      totalQuantity: finalTotalQty,
      totalAmount: finalTotalAmount,
      amountChargeable,
      amountInWords: words,
      bankKey: dto.bankKey || null,
      bankDetails: bankDetails || null,
      declaration:
        dto.declaration ||
        'WE HEREBY CERTIFY THAT THE GOODS SUPPLIED ARE OF 100% KAZAKHSTAN ORIGIN.',
      signatureUrl: dto.signatureUrl || null,
      stampUrl: dto.stampUrl || null,
      signatoryName: dto.signatoryName || null,
      signatoryDesignation: dto.signatoryDesignation || null,
      remarks: dto.remarks || null,
      metadata: {
        ...(dto.metadata || {}),
        ...(businessRef ? { businessReference: businessRef } : {}),
        ...(dto.placeOfReceiptByPreCarrier
          ? { placeOfReceiptByPreCarrier: dto.placeOfReceiptByPreCarrier }
          : {}),
        ...(isGroupedInvoice
          ? {
              isMultiShipment: true,
              ...(dto.stuffingGroupId
                ? { stuffingGroupId: dto.stuffingGroupId }
                : {}),
              ...(resolvedGroupShipmentIds.length > 0
                ? { shipmentIds: resolvedGroupShipmentIds }
                : {}),
            }
          : {}),
      },
      createdBy: user?.id || null,
      updatedBy: user?.id || null,
    });

    if (
      isGroupedInvoice &&
      this.invoiceStuffingGroupModel &&
      typeof this.invoiceStuffingGroupModel.create === 'function'
    ) {
      await this.invoiceStuffingGroupModel.create({
        exportInvoiceId: created.id,
        stuffingGroupId: dto.stuffingGroupId || null,
        shipmentIds: resolvedGroupShipmentIds,
      });
    }

    return created;
  }

  /**
   * Retrieves list of Export Invoices with search and filters
   */
  async findAll(query: QueryExportInvoiceDto, user?: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const where: any = {};

    if (query.companyId) {
      where.companyId = query.companyId;
    } else if (user?.companyId) {
      where.companyId = user.companyId;
    }

    if (query.salesContractId) {
      where.salesContractId = query.salesContractId;
    }

    if (query.shipmentId) {
      where.shipmentId = query.shipmentId;
    }

    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }

    if (query.currency) {
      where.currency = query.currency.toUpperCase();
    }

    if (query.invoiceDateFrom || query.invoiceDateTo) {
      where.invoiceDate = {};
      if (query.invoiceDateFrom) {
        where.invoiceDate[Op.gte] = query.invoiceDateFrom;
      }
      if (query.invoiceDateTo) {
        where.invoiceDate[Op.lte] = query.invoiceDateTo;
      }
    }

    if (query.businessReference) {
      const txId = await resolveBusinessTransactionId(
        query.businessReference,
        where.companyId,
      );
      if (txId && txId !== -1) {
        const contracts = await this.contractModel.findAll({
          where: { businessTransactionId: txId },
          attributes: ['id'],
        });
        const shipments = await this.shipmentModel.findAll({
          where: { businessTransactionId: txId },
          attributes: ['id'],
        });
        const cIds = contracts.map((c) => c.id);
        const sIds = shipments.map((s) => s.id);
        where[Op.or] = [
          ...(where[Op.or] || []),
          ...(cIds.length > 0 ? [{ salesContractId: { [Op.in]: cIds } }] : []),
          ...(sIds.length > 0 ? [{ shipmentId: { [Op.in]: sIds } }] : []),
          { 'metadata.businessReference': query.businessReference.trim().toUpperCase() },
        ];
      }
    }

    if (query.search) {
      const s = `%${query.search.trim()}%`;
      const orConditions: any[] = [
        { invoiceNumber: { [Op.iLike]: s } },
        { sellerOrderNo: { [Op.iLike]: s } },
        { exporterRef: { [Op.iLike]: s } },
        { otherRef: { [Op.iLike]: s } },
        { 'consigneeDetails.name': { [Op.iLike]: s } },
        { 'metadata.businessReference': { [Op.iLike]: s } },
      ];

      if (isBusinessReferenceSearch(query.search)) {
        const txId = await resolveBusinessTransactionId(
          query.search,
          where.companyId,
        );
        if (txId && txId !== -1) {
          const contracts = await this.contractModel.findAll({
            where: { businessTransactionId: txId },
            attributes: ['id'],
          });
          const shipments = await this.shipmentModel.findAll({
            where: { businessTransactionId: txId },
            attributes: ['id'],
          });
          const cIds = contracts.map((c) => c.id);
          const sIds = shipments.map((s) => s.id);
          if (cIds.length > 0) {
            orConditions.push({ salesContractId: { [Op.in]: cIds } });
          }
          if (sIds.length > 0) {
            orConditions.push({ shipmentId: { [Op.in]: sIds } });
          }
        }
      }
      where[Op.or] = orConditions;
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const findAllIncludes: any[] = [
      {
        model: SalesContract,
        as: 'salesContract',
        attributes: ['id', 'contractNumber', 'contractDate', 'businessTransactionId'],
        required: false,
        include: [
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
            attributes: ['id', 'businessReference'],
            required: false,
          },
        ],
      },
      {
        model: SalesContractShipment,
        as: 'shipment',
        attributes: ['id', 'shipmentReference', 'quantity', 'shipmentDate', 'businessTransactionId'],
        required: false,
        include: [
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
            attributes: ['id', 'businessReference'],
            required: false,
          },
        ],
      },
    ];
    if (this.invoiceStuffingGroupModel) {
      findAllIncludes.push({
        model: ExportInvoiceStuffingGroup,
        as: 'stuffingGroupLink',
        required: false,
      });
    }

    const { rows, count } = await this.invoiceModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: findAllIncludes,
    });

    // Lookup fallback contracts by sellerOrderNo for invoices without direct contract/shipment link
    const missingContractNos = rows
      .filter((r) => !r.salesContract && !r.shipment && r.sellerOrderNo)
      .map((r) => r.sellerOrderNo as string);

    const contractMapByNo = new Map<string, any>();
    if (missingContractNos.length > 0) {
      try {
        const foundContracts = await this.contractModel.findAll({
          where: {
            contractNumber: { [Op.in]: missingContractNos },
          },
          include: [
            {
              model: BusinessTransaction,
              as: 'businessTransaction',
              attributes: ['id', 'businessReference'],
              required: false,
            },
          ],
        });
        foundContracts.forEach((c) => {
          if (c.contractNumber) {
            contractMapByNo.set(c.contractNumber, c);
          }
        });
      } catch (e) {
        this.logger.warn(`Could not lookup contracts by sellerOrderNo: ${e.message}`);
      }
    }

    const data = rows.map((inv) => {
      const plain = inv.get({ plain: true });
      const fallbackContract = plain.sellerOrderNo
        ? contractMapByNo.get(plain.sellerOrderNo)
        : null;
      const businessRef =
        plain.metadata?.businessReference ||
        plain.shipment?.businessTransaction?.businessReference ||
        plain.salesContract?.businessTransaction?.businessReference ||
        fallbackContract?.businessTransaction?.businessReference ||
        plain.shipment?.shipmentReference ||
        null;
      const groupShipmentIds = Array.isArray(plain.stuffingGroupLink?.shipmentIds)
        ? plain.stuffingGroupLink.shipmentIds
        : Array.isArray(plain.metadata?.shipmentIds)
          ? plain.metadata.shipmentIds
          : [];
      const stuffingGroupId =
        plain.stuffingGroupLink?.stuffingGroupId ||
        plain.metadata?.stuffingGroupId ||
        null;
      const isMultiShipment = Boolean(
        stuffingGroupId ||
          groupShipmentIds.length > 1 ||
          plain.metadata?.isMultiShipment,
      );

      return {
        ...plain,
        businessReference: businessRef,
        ...(isMultiShipment
          ? {
              isMultiShipment: true,
              stuffingGroupId,
              shipmentIds: groupShipmentIds,
            }
          : {}),
      };
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data,
      total: count,
      totalPages,
      page,
      limit,
    };
  }

  /**
   * Retrieves a single Export Invoice by ID
   */
  async findOne(id: number, user?: any) {
    const findOneIncludes: any[] = [
      {
        model: SalesContract,
        as: 'salesContract',
        include: [
          { model: Partner, as: 'buyer' },
          { model: Partner, as: 'seller' },
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
            attributes: ['id', 'businessReference'],
            required: false,
          },
        ],
      },
      {
        model: SalesContractShipment,
        as: 'shipment',
        include: [
          {
            model: ShipmentStuffing,
            as: 'stuffingExecution',
          },
          {
            model: BusinessTransaction,
            as: 'businessTransaction',
            attributes: ['id', 'businessReference'],
            required: false,
          },
        ],
      },
      {
        model: PurchaseContract,
        as: 'purchaseContract',
      },
      {
        model: Company,
        as: 'company',
      },
    ];
    if (this.invoiceStuffingGroupModel) {
      findOneIncludes.push({
        model: ExportInvoiceStuffingGroup,
        as: 'stuffingGroupLink',
        required: false,
      });
    }

    const invoice = await this.invoiceModel.findByPk(id, {
      include: findOneIncludes,
    });

    if (!invoice) {
      throw new NotFoundException(`Export Invoice #${id} not found`);
    }

    const plain = invoice.get({ plain: true });
    let fallbackContract: any = null;
    if (!plain.shipment && !plain.salesContract && plain.sellerOrderNo) {
      try {
        fallbackContract = await this.contractModel.findOne({
          where: { contractNumber: plain.sellerOrderNo },
          include: [
            {
              model: BusinessTransaction,
              as: 'businessTransaction',
              attributes: ['id', 'businessReference'],
              required: false,
            },
          ],
        });
      } catch (e) {
        this.logger.warn(`Could not lookup contract for sellerOrderNo: ${e.message}`);
      }
    }

    const businessRef =
      plain.metadata?.businessReference ||
      plain.shipment?.businessTransaction?.businessReference ||
      plain.salesContract?.businessTransaction?.businessReference ||
      fallbackContract?.businessTransaction?.businessReference ||
      plain.shipment?.shipmentReference ||
      null;

    (invoice as any).setDataValue('businessReference', businessRef);
    (invoice as any).businessReference = businessRef;

    const groupLink = plain.stuffingGroupLink;
    const grpShipmentIds = Array.isArray(groupLink?.shipmentIds)
      ? groupLink.shipmentIds
      : Array.isArray(plain.metadata?.shipmentIds)
        ? plain.metadata.shipmentIds
        : [];
    const grpId =
      groupLink?.stuffingGroupId || plain.metadata?.stuffingGroupId || null;
    if (grpId || grpShipmentIds.length > 1 || plain.metadata?.isMultiShipment) {
      (invoice as any).setDataValue('isMultiShipment', true);
      (invoice as any).isMultiShipment = true;
      (invoice as any).setDataValue('stuffingGroupId', grpId);
      (invoice as any).stuffingGroupId = grpId;
      (invoice as any).setDataValue('shipmentIds', grpShipmentIds);
      (invoice as any).shipmentIds = grpShipmentIds;
    }

    return invoice;
  }

  /**
   * Updates an existing Export Invoice
   */
  async update(id: number, dto: UpdateExportInvoiceDto, user?: any) {
    const invoice = await this.findOne(id, user);

    // Recalculate totals if goodsItems updated
    if (dto.goodsItems) {
      let totalQty = 0;
      let totalAmt = 0;
      const goods = dto.goodsItems.map((item) => {
        const q = Number(item.quantity || 0);
        const r = Number(item.rate || 0);
        const a = parseFloat((q * r).toFixed(2));
        totalQty += q;
        totalAmt += a;
        return {
          ...item,
          quantity: q,
          rate: r,
          amount: a,
        };
      });
      dto.goodsItems = goods;
      dto.totalQuantity = dto.totalQuantity !== undefined ? dto.totalQuantity : totalQty;
      dto.totalAmount = dto.totalAmount !== undefined ? dto.totalAmount : totalAmt;
      dto.amountChargeable = dto.amountChargeable !== undefined ? dto.amountChargeable : dto.totalAmount;
      const curr = dto.currency || invoice.currency;
      dto.amountInWords = dto.amountInWords || convertAmountToWords(dto.amountChargeable, curr);
    }

    // Bank resolution if bankKey provided but no bankDetails
    if (dto.bankKey && !dto.bankDetails) {
      const bankOpt = await this.bankProvider.getBankByKey(dto.bankKey);
      if (bankOpt) dto.bankDetails = bankOpt.details;
    }
    if (dto.bankDetails) {
      const formatted = dto.bankDetails.formattedText || dto.bankDetails.bankDetailsText || dto.bankDetails.additionalDetails || '';
      dto.bankDetails = {
        ...dto.bankDetails,
        formattedText: formatted,
        bankDetailsText: formatted,
        additionalDetails: formatted,
      };
    }

    const updatedMetadata = {
      ...(invoice.metadata || {}),
      ...(dto.metadata || {}),
      ...(dto.placeOfReceiptByPreCarrier
        ? { placeOfReceiptByPreCarrier: dto.placeOfReceiptByPreCarrier }
        : {}),
    };

    await invoice.update({
      ...dto,
      metadata: updatedMetadata,
      updatedBy: user?.id || invoice.updatedBy,
    });

    return invoice;
  }

  /**
   * Deletes an Export Invoice
   */
  async remove(id: number, user?: any) {
    const invoice = await this.findOne(id, user);
    await invoice.destroy();
    return { success: true, message: `Invoice #${id} deleted successfully` };
  }

  /**
   * Previews next sequence / invoice number for a contract
   */
  async previewNextNumber(
    companyId: number | null,
    contractNumber: string,
    manualSequence?: number | string,
  ) {
    return this.invoiceNumberService.previewNextNumber(
      companyId,
      contractNumber,
      manualSequence,
    );
  }

  /**
   * Sets initial sequence manually
   */
  async setInitialSequence(companyId: number | null, sequence: number) {
    return this.invoiceNumberService.setInitialSequence(companyId, sequence);
  }

  /**
   * Gets available bank options
   */
  async getBankOptions(currency?: string) {
    return this.bankProvider.getAvailableBanks(currency);
  }

  /**
   * Uploads signature or stamp
   */
  async uploadSignatureOrStamp(file: Express.Multer.File, type: 'signature' | 'stamp') {
    return this.signatureProvider.saveUploadedFile(file, type);
  }
}
