import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Model, ModelCtor, Sequelize } from 'sequelize-typescript';
import { BusinessTransaction } from '../models/business-transaction.model';

type RootType = 'Enquiry' | 'SalesContract' | 'PurchaseContract';

@Injectable()
export class BusinessTransactionService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  private getModel(name: string): ModelCtor<Model> | undefined {
    const model = this.sequelize.models[name] as ModelCtor<Model> | undefined;
    if (!model) {
      throw new Error(`Business transaction model "${name}" is not registered`);
    }
    return model;
  }

  private async nextReference(transaction: Transaction): Promise<string> {
    const rows = await this.sequelize.query<{ last_value: string | number }>(
      `UPDATE business_transaction_counters
       SET last_value = last_value + 1
       WHERE id = 1
       RETURNING last_value`,
      { type: QueryTypes.SELECT, transaction },
    );
    if (!rows[0]) {
      throw new Error('Business transaction counter row is missing');
    }
    return `REF-${String(rows[0].last_value).padStart(6, '0')}`;
  }

  private async getOrCreateRoot(
    rootType: RootType,
    rootId: string | number,
    companyId: number | null,
    userId: number | null,
    transaction: Transaction,
  ): Promise<BusinessTransaction> {
    const model = this.getModel(rootType);
    const root = await model.findByPk(rootId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!root) {
      throw new NotFoundException(`${rootType} not found`);
    }

    const rootData = root.get({ plain: true }) as {
      id: string | number;
      businessTransactionId?: number | null;
    };
    if (rootData.businessTransactionId) {
      const existing = await BusinessTransaction.findByPk(
        rootData.businessTransactionId,
        { transaction },
      );
      if (!existing) {
        throw new Error(
          `${rootType} ${rootId} points to a missing Business Transaction`,
        );
      }
      return existing;
    }

    const [existingByOrigin] = await BusinessTransaction.findOrBuild({
      where: { originType: rootType, originId: String(rootId) },
      transaction,
    });
    if (existingByOrigin.isNewRecord) {
      const reference = await this.nextReference(transaction);
      const created = await BusinessTransaction.create(
        {
          businessReference: reference,
          originType: rootType,
          originId: String(rootId),
          companyId,
          createdBy: userId,
        },
        { transaction },
      );
      await root.update(
        { businessTransactionId: created.id },
        { transaction },
      );
      return created;
    }

    const transactionId = existingByOrigin.id;
    await root.update({ businessTransactionId: transactionId }, { transaction });
    return existingByOrigin;
  }

  private async setRelatedRecords(
    modelName: string,
    where: Record<string, unknown>,
    businessTransactionId: number,
    transaction: Transaction,
  ): Promise<void> {
    const model = this.getModel(modelName);
    const records = await model.findAll({
      where,
      attributes: ['id', 'businessTransactionId'],
      transaction,
    });

    const conflicting = records.find(
      (record) =>
        (record.get({ plain: true }) as any).businessTransactionId != null &&
        Number(
          (record.get({ plain: true }) as any).businessTransactionId,
        ) !== Number(businessTransactionId),
    );
    if (conflicting) {
      throw new ConflictException(
        `${modelName} record ${conflicting.get('id')} already belongs to another Business Transaction`,
      );
    }

    await model.update(
      { businessTransactionId },
      {
        where: {
          ...where,
          [Op.or]: [
            { businessTransactionId: null },
            { businessTransactionId },
          ],
        } as any,
        transaction,
      },
    );
  }

  private async findByForeignKey(
    modelName: string,
    foreignKey: string,
    parentIds: Array<string | number>,
  ): Promise<Model[]> {
    if (parentIds.length === 0) return [];
    return this.getModel(modelName).findAll({
      where: { [foreignKey]: { [Op.in]: parentIds } },
      order: [['id', 'ASC']],
    });
  }

  private async propagateEnquiry(
    enquiryId: string,
    businessTransactionId: number,
    transaction: Transaction,
  ): Promise<void> {
    await this.setRelatedRecords(
      'SalesContract',
      { enquiryId },
      businessTransactionId,
      transaction,
    );
    await this.setRelatedRecords(
      'Logistics',
      { enquiryId },
      businessTransactionId,
      transaction,
    );
    await this.setRelatedRecords(
      'Quotation',
      { enquiryId },
      businessTransactionId,
      transaction,
    );

    const salesContracts = await this.getModel('SalesContract').findAll({
      where: { enquiryId },
      attributes: ['id'],
      transaction,
    });
    for (const contract of salesContracts) {
      const id = Number(contract.get('id'));
      await this.propagateSalesContract(id, businessTransactionId, transaction);
    }

    const logisticsRows = await this.getModel('Logistics').findAll({
      where: { enquiryId },
      attributes: ['id'],
      transaction,
    });
    for (const logistics of logisticsRows) {
      await this.setRelatedRecords(
        'FreightQuote',
        { logisticsId: logistics.get('id') },
        businessTransactionId,
        transaction,
      );
    }
  }

  private async propagateSalesContract(
    salesContractId: number,
    businessTransactionId: number,
    transaction: Transaction,
  ): Promise<void> {
    await this.setRelatedRecords(
      'SalesContractShipment',
      { salesContractId },
      businessTransactionId,
      transaction,
    );
    await this.setRelatedRecords(
      'PurchaseContract',
      { salesContractId },
      businessTransactionId,
      transaction,
    );

    const purchaseContracts = await this.getModel('PurchaseContract').findAll({
      where: { salesContractId },
      attributes: ['id'],
      transaction,
    });
    for (const contract of purchaseContracts) {
      await this.propagatePurchaseContract(
        Number(contract.get('id')),
        businessTransactionId,
        transaction,
      );
    }

    const shipments = await this.getModel('SalesContractShipment').findAll({
      where: { salesContractId },
      attributes: ['id'],
      transaction,
    });
    for (const shipment of shipments) {
      await this.setRelatedRecords(
        'CargoLoading',
        { shipmentId: shipment.get('id') },
        businessTransactionId,
        transaction,
      );
    }
  }

  private async propagatePurchaseContract(
    purchaseContractId: number,
    businessTransactionId: number,
    transaction: Transaction,
  ): Promise<void> {
    await this.setRelatedRecords(
      'CargoAvailability',
      { purchaseContractId },
      businessTransactionId,
      transaction,
    );
  }

  async ensureForEnquiry(
    enquiryId: string,
    userId?: number,
    transaction?: Transaction,
  ): Promise<BusinessTransaction> {
    const run = async (tx: Transaction) => {
      const enquiryModel = this.getModel('Enquiry');
      const enquiry = await enquiryModel.findByPk(enquiryId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!enquiry) throw new NotFoundException('Enquiry not found');

      const values = enquiry.get({ plain: true }) as any;
      if (values.status !== 'CONFIRMED') {
        throw new ConflictException(
          'A Business Transaction can only be created for a CONFIRMED Enquiry',
        );
      }
      const businessTransaction = await this.getOrCreateRoot(
        'Enquiry',
        enquiryId,
        values.companyId ?? null,
        userId ?? null,
        tx,
      );
      await this.propagateEnquiry(enquiryId, businessTransaction.id, tx);
      return businessTransaction;
    };
    return transaction ? run(transaction) : this.sequelize.transaction(run);
  }

  async ensureForSalesContract(
    salesContractId: number,
    userId?: number,
    transaction?: Transaction,
  ): Promise<BusinessTransaction | null> {
    const run = async (tx: Transaction) => {
      const salesContract = await this.getModel('SalesContract').findByPk(
        salesContractId,
        { transaction: tx },
      );
      if (!salesContract) throw new NotFoundException('Sales Contract not found');
      const values = salesContract.get({ plain: true }) as any;

      if (values.enquiryId) {
        const enquiry = await this.getModel('Enquiry').findByPk(
          values.enquiryId,
          { transaction: tx },
        );
        if (!enquiry) throw new NotFoundException('Linked Enquiry not found');
        const enquiryValues = enquiry.get({ plain: true }) as any;
        if (enquiryValues.status !== 'CONFIRMED') return null;
        const businessTransaction = await this.ensureForEnquiry(
          String(values.enquiryId),
          userId,
          tx,
        );
        return businessTransaction;
      }

      if (values.status !== 'Active') return null;
      const businessTransaction = await this.getOrCreateRoot(
        'SalesContract',
        salesContractId,
        values.companyId ?? null,
        userId ?? null,
        tx,
      );
      await this.propagateSalesContract(
        salesContractId,
        businessTransaction.id,
        tx,
      );
      return businessTransaction;
    };
    return transaction ? run(transaction) : this.sequelize.transaction(run);
  }

  async ensureForPurchaseContract(
    purchaseContractId: number,
    userId?: number,
    transaction?: Transaction,
  ): Promise<BusinessTransaction | null> {
    const run = async (tx: Transaction) => {
      const purchaseContract = await this.getModel('PurchaseContract').findByPk(
        purchaseContractId,
        { transaction: tx },
      );
      if (!purchaseContract) {
        throw new NotFoundException('Purchase Contract not found');
      }
      const values = purchaseContract.get({ plain: true }) as any;

      if (values.salesContractId) {
        const businessTransaction = await this.ensureForSalesContract(
          Number(values.salesContractId),
          userId,
          tx,
        );
        if (businessTransaction) {
          await this.setRelatedRecords(
            'PurchaseContract',
            { id: purchaseContractId },
            businessTransaction.id,
            tx,
          );
          await this.propagatePurchaseContract(
            purchaseContractId,
            businessTransaction.id,
            tx,
          );
          return businessTransaction;
        }
        return null;
      }

      if (values.purchaseType !== 'MTT' || values.status !== 'In Progress') {
        return null;
      }
      const businessTransaction = await this.getOrCreateRoot(
        'PurchaseContract',
        purchaseContractId,
        values.companyId ?? null,
        userId ?? null,
        tx,
      );
      await this.propagatePurchaseContract(
        purchaseContractId,
        businessTransaction.id,
        tx,
      );
      return businessTransaction;
    };
    return transaction ? run(transaction) : this.sequelize.transaction(run);
  }

  async syncEnquiryStatus(
    enquiryId: string,
    followUpStatus: string,
    userId?: number,
  ): Promise<void> {
    const newStatus =
      followUpStatus === 'Waiting Response'
        ? 'WAITING_RESPONSE'
        : followUpStatus === 'Confirmed' || followUpStatus === 'Deal Finalized'
          ? 'CONFIRMED'
          : followUpStatus === 'Closed'
            ? 'CLOSED'
            : 'PENDING';

    await this.sequelize.transaction(async (transaction) => {
      const enquiry = await this.getModel('Enquiry').findByPk(enquiryId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!enquiry) return;
      await enquiry.update({ status: newStatus }, { transaction });
      if (newStatus === 'CONFIRMED') {
        await this.ensureForEnquiry(enquiryId, userId, transaction);
      }
    });
  }

  async findByReference(reference: string, companyId: number) {
    const businessTransaction = await BusinessTransaction.findOne({
      where: { businessReference: reference, companyId },
    });
    if (!businessTransaction) {
      throw new NotFoundException(`Business Transaction "${reference}" not found`);
    }

    const transactionId = businessTransaction.id;
    const modelGroups = [
      ['enquiry', 'Enquiry'],
      ['quotations', 'Quotation'],
      ['salesContracts', 'SalesContract'],
      ['purchaseContracts', 'PurchaseContract'],
      ['shipments', 'SalesContractShipment'],
      ['logistics', 'Logistics'],
      ['freightQuotes', 'FreightQuote'],
      ['cargoAvailability', 'CargoAvailability'],
      ['cargoLoading', 'CargoLoading'],
    ] as const;
    const records: Record<string, unknown> = {};
    for (const [key, modelName] of modelGroups) {
      const model = this.getModel(modelName);
      const rows = await model.findAll({
        where: { businessTransactionId: transactionId },
        order: [['id', 'ASC']],
      });
      records[key] = rows;
    }

    const ids = (key: string) =>
      ((records[key] as Model[] | undefined) ?? []).map((row) => row.get('id'));
    const salesContractIds = ids('salesContracts');
    const purchaseContractIds = ids('purchaseContracts');
    const logisticsIds = ids('logistics');
    const freightQuoteIds = ids('freightQuotes');
    const cargoAvailabilityIds = ids('cargoAvailability');
    const cargoLoadingIds = ids('cargoLoading');

    const childGroups = [
      ['salesContractItems', 'SalesContractItem', 'salesContractId', salesContractIds],
      ['salesContractDocuments', 'SalesContractDocument', 'salesContractId', salesContractIds],
      ['salesContractDocumentFiles', 'SalesContractDocumentFile', 'salesContractId', salesContractIds],
      ['purchaseContractItems', 'PurchaseContractItem', 'purchaseContractId', purchaseContractIds],
      ['purchaseContractDocuments', 'PurchaseContractRequiredDocument', 'purchaseContractId', purchaseContractIds],
      ['purchaseContractAttachments', 'PurchaseContractAttachment', 'purchaseContractId', purchaseContractIds],
      ['purchaseContractShipments', 'PurchaseContractShipment', 'purchaseContractId', purchaseContractIds],
      ['logisticsRoutes', 'LogisticsRoute', 'logisticsId', logisticsIds],
      ['freightQuoteCharges', 'FreightQuoteCharge', 'quoteId', freightQuoteIds],
      ['freightQuoteContainerRates', 'FreightQuoteContainerRate', 'quoteId', freightQuoteIds],
      ['freightRoutes', 'FreightRoute', 'quoteId', freightQuoteIds],
      ['cargoReadiness', 'CargoReadiness', 'cargoAvailabilityId', cargoAvailabilityIds],
      ['cargoShipmentAllocations', 'CargoShipmentAllocation', 'cargoAvailabilityId', cargoAvailabilityIds],
      ['cargoDocuments', 'CargoDocument', 'cargoLoadingId', cargoLoadingIds],
    ] as const;
    for (const [key, modelName, foreignKey, parentIds] of childGroups) {
      records[key] = await this.findByForeignKey(
        modelName,
        foreignKey,
        parentIds,
      );
    }

    const freightRouteIds = ids('freightRoutes');
    records.freightRouteRates = await this.findByForeignKey(
      'FreightRate',
      'routeId',
      freightRouteIds,
    );
    const cargoReadinessIds = ids('cargoReadiness');
    records.cargoReadinessDocuments = await this.findByForeignKey(
      'CargoDocument',
      'cargoReadinessId',
      cargoReadinessIds,
    );

    return {
      businessTransaction,
      ...records,
    };
  }
}
