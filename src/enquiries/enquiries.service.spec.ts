import { Op } from 'sequelize';
import { EnquiriesService } from './enquiries.service';

describe('EnquiriesService.findAll contract filters', () => {
  const makeService = () => {
    const row = {
      id: 'enquiry-id',
      status: 'CONFIRMED',
      get: jest.fn().mockReturnValue(42),
    };
    const enquiryModel = {
      findAndCountAll: jest.fn().mockResolvedValue({ rows: [row], count: 1 }),
    };
    const service = new EnquiriesService(
      enquiryModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, enquiryModel };
  };

  it.each(['CONFIRMED', 'CLOSED'])(
    'returns %s history without contract-based filtering',
    async (status) => {
      const { service, enquiryModel } = makeService();

      await service.findAll({ status, companyId: 7 } as any);

      const options = enquiryModel.findAndCountAll.mock.calls[0][0];
      expect(options.where.status).toBe(status);
      expect(options.where.id).toBeUndefined();
    },
  );

  it('filters the Sales Contract queue using the Sales Contract relationship', async () => {
    const { service, enquiryModel } = makeService();

    await service.findAll({
      status: 'CONFIRMED',
      withoutSalesContract: true,
      companyId: 7,
    } as any);

    const options = enquiryModel.findAndCountAll.mock.calls[0][0];
    expect(options.where.status).toBe('CONFIRMED');
    expect(options.where.id[Op.notIn].val).toContain('sales_contracts');
    expect(options.where.id[Op.notIn].val).not.toContain('purchase_contracts');
  });

  it('filters the Purchase Contract queue to linked Sales Contracts without a Purchase Contract', async () => {
    const { service, enquiryModel } = makeService();

    const result = await service.findAll({
      status: 'CONFIRMED',
      withoutPurchaseContract: true,
      companyId: 7,
    } as any);

    const options = enquiryModel.findAndCountAll.mock.calls[0][0];
    const conditions = options.where.id[Op.and];
    expect(options.where.status).toBe('CONFIRMED');
    expect(conditions.some((condition) => condition[Op.in]?.val.includes('sales_contracts'))).toBe(true);
    expect(conditions.some((condition) => condition[Op.notIn]?.val.includes('purchase_contracts'))).toBe(true);
    expect(options.attributes.include[0][0].val).toContain('sales_contracts');
    expect(result.data[0].salesContractId).toBe(42);
  });
});
