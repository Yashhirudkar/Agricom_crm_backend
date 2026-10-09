import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { SalesReportService } from './sales-report.service';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { User } from '../../users/models/user.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { Enquiry } from '../../enquiries/models/enquiry.model';

describe('SalesReportService confirmed-order date filters', () => {
  let service: SalesReportService;
  let enquiryModel: { findAll: jest.Mock };

  beforeEach(async () => {
    enquiryModel = { findAll: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesReportService,
        { provide: getModelToken(SalesContract), useValue: {} },
        { provide: getModelToken(SalesContractItem), useValue: {} },
        { provide: getModelToken(User), useValue: {} },
        { provide: getModelToken(Partner), useValue: {} },
        { provide: getModelToken(Product), useValue: {} },
        { provide: getModelToken(Enquiry), useValue: enquiryModel },
      ],
    }).compile();

    service = module.get(SalesReportService);
  });

  it('filters by the selected month even when no year is selected', async () => {
    await service.getConfirmedOrders({ month: '10' });

    const where = enquiryModel.findAll.mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(where[Op.and][0].val).toBe(
      'EXTRACT(MONTH FROM "Enquiry"."enquiry_date") = 10',
    );
  });

  it('filters the entire selected month when both month and year are selected', async () => {
    await service.getConfirmedOrders({ year: '2026', month: '10' });

    const where = enquiryModel.findAll.mock.calls[0][0].where;
    expect(where.enquiryDate[Op.between]).toEqual([
      '2026-10-01',
      '2026-10-31',
    ]);
  });
});
