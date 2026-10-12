import { BusinessTransaction } from '../models/business-transaction.model';
import { BusinessTransactionService } from './business-transaction.service';

describe('BusinessTransactionService enquiry allocation', () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } } as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not allocate a reference for an unconfirmed enquiry', async () => {
    const enquiry = {
      get: () => ({ status: 'NEW', companyId: 7, businessTransactionId: null }),
    };
    const sequelize = {
      models: {
        Enquiry: { findByPk: jest.fn().mockResolvedValue(enquiry) },
      },
      transaction: jest.fn(),
    };
    const service = new BusinessTransactionService(sequelize as any);

    await expect(
      service.ensureForEnquiry('enquiry-1', 3, transaction),
    ).rejects.toThrow('CONFIRMED Enquiry');
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('allocates once and reuses the immutable reference on repeat confirmation', async () => {
    let businessTransactionId: number | null = null;
    const enquiry = {
      get: () => ({
        status: 'CONFIRMED',
        companyId: 7,
        businessTransactionId,
      }),
      update: jest.fn(async (values: { businessTransactionId: number }) => {
        businessTransactionId = values.businessTransactionId;
      }),
    };
    const model = () => ({
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue([0]),
    });
    const models = {
      Enquiry: { findByPk: jest.fn().mockResolvedValue(enquiry) },
      SalesContract: model(),
      Logistics: model(),
      Quotation: model(),
      FreightQuote: model(),
      SalesContractShipment: model(),
      PurchaseContract: model(),
      CargoLoading: model(),
      CargoAvailability: model(),
    };
    const sequelize = {
      models,
      query: jest.fn().mockResolvedValue([{ last_value: 1 }]),
      transaction: jest.fn(),
    };
    const created = { id: 101, businessReference: 'REF-000001' };
    const originTransaction = {
      isNewRecord: true,
      id: 101,
    };
    const findOrBuild = jest
      .spyOn(BusinessTransaction, 'findOrBuild')
      .mockResolvedValue([originTransaction as any, true]);
    const findByPk = jest
      .spyOn(BusinessTransaction, 'findByPk')
      .mockResolvedValue(created as any);
    const create = jest
      .spyOn(BusinessTransaction, 'create')
      .mockResolvedValue(created as any);
    const service = new BusinessTransactionService(sequelize as any);

    const first = await service.ensureForEnquiry('enquiry-1', 3, transaction);
    const second = await service.ensureForEnquiry('enquiry-1', 3, transaction);

    expect(first.businessReference).toBe('REF-000001');
    expect(second.businessReference).toBe('REF-000001');
    expect(create).toHaveBeenCalledTimes(1);
    expect(findOrBuild).toHaveBeenCalledTimes(1);
    expect(findByPk).toHaveBeenCalledTimes(1);
    expect(sequelize.query).toHaveBeenCalledTimes(1);
    expect(enquiry.update).toHaveBeenCalledWith(
      { businessTransactionId: 101 },
      { transaction },
    );
  });
});
