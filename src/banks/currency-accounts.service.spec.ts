import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UniqueConstraintError } from 'sequelize';
import { CurrencyAccountsService } from './currency-accounts.service';
import { CurrencyAccount } from './models/currency-account.model';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { Company } from '../companies/models/company.model';
import { AuditService } from '../audit/services/audit.service';

interface MockCurrencyAccountModel {
  sequelize: {
    transaction: jest.Mock;
  };
  findOne: jest.Mock;
  findByPk: jest.Mock;
  findAndCountAll: jest.Mock;
  create: jest.Mock;
}

describe('CurrencyAccountsService', () => {
  let service: CurrencyAccountsService;
  let mockCurrencyAccountModel: MockCurrencyAccountModel;
  let mockDomesticBankModel: { findByPk: jest.Mock };
  let mockNostroBankModel: { findAll: jest.Mock };
  let mockCompanyModel: { findByPk: jest.Mock };
  let mockAuditService: { writeDiffLog: jest.Mock };

  const mockTransaction = { id: 'tx-1' };

  beforeEach(() => {
    mockCurrencyAccountModel = {
      sequelize: {
        transaction: jest.fn((cb: (t: unknown) => Promise<unknown>) =>
          cb(mockTransaction),
        ),
      },
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    };

    mockDomesticBankModel = {
      findByPk: jest.fn(),
    };

    mockNostroBankModel = {
      findAll: jest.fn(),
    };

    mockCompanyModel = {
      findByPk: jest.fn(),
    };

    mockAuditService = {
      writeDiffLog: jest.fn().mockResolvedValue(undefined),
    };

    service = new CurrencyAccountsService(
      mockCurrencyAccountModel as unknown as typeof CurrencyAccount,
      mockDomesticBankModel as unknown as typeof DomesticBank,
      mockNostroBankModel as unknown as typeof NostroBank,
      mockCompanyModel as unknown as typeof Company,
      mockAuditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('creates a currency account with Status defaulting to Active and derives companyId from Domestic Bank', async () => {
      mockDomesticBankModel.findByPk.mockResolvedValue({
        id: 10,
        companyId: 2,
        bankName: 'DBS BANK INDIA LIMITED',
        company: { id: 2, clientId: 1, name: 'Agricom' },
      });
      mockCurrencyAccountModel.findOne.mockResolvedValue(null);
      mockCurrencyAccountModel.create.mockResolvedValue({ id: 101 });
      const createdRecord = {
        id: 101,
        companyId: 2,
        domesticBankId: 10,
        currency: 'USD',
        accountNumber: 'USD-1001',
        status: 'Active',
        company: { id: 2, clientId: 1, name: 'Agricom' },
        domesticBank: { id: 10, bankName: 'DBS BANK INDIA LIMITED' },
      };
      mockCurrencyAccountModel.findByPk.mockResolvedValue({
        ...createdRecord,
        toJSON: () => createdRecord,
      });

      const res = await service.create(
        {
          domesticBankId: 10,
          currency: ' usd ',
          accountNumber: ' USD-1001 ',
          accountName: 'USD Operating',
          swiftCode: 'dbssinbbxxx',
          iban: '  de893704  ',
          branchName: 'Mumbai Fort',
          address: 'Mumbai',
          remarks: 'Primary USD account',
        },
        { userId: 7, clientId: 1, type: 'client_admin' },
      );

      expect(mockCurrencyAccountModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 2,
          domesticBankId: 10,
          currency: 'USD',
          accountNumber: 'USD-1001',
          swiftCode: 'DBSSINBBXXX',
          iban: 'DE893704',
          status: 'Active',
        }),
        { transaction: mockTransaction },
      );
      expect(res.id).toBe(101);
      expect(mockAuditService.writeDiffLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'CurrencyAccount',
          entityId: 101,
        }),
      );
    });

    it('rejects duplicate Account Number within the same Domestic Bank', async () => {
      mockDomesticBankModel.findByPk.mockResolvedValue({
        id: 10,
        companyId: 2,
        company: { id: 2, clientId: 1 },
      });
      mockCurrencyAccountModel.findOne.mockResolvedValue({
        id: 55,
        accountNumber: 'ACC-100',
      });

      await expect(
        service.create({
          domesticBankId: 10,
          currency: 'EUR',
          accountNumber: 'ACC-100',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockCurrencyAccountModel.create).not.toHaveBeenCalled();
    });

    it('maps database UniqueConstraintError to BadRequestException on race condition', async () => {
      mockDomesticBankModel.findByPk.mockResolvedValue({
        id: 10,
        companyId: 2,
        company: { id: 2, clientId: 1 },
      });
      mockCurrencyAccountModel.findOne.mockResolvedValue(null);
      mockCurrencyAccountModel.create.mockRejectedValue(
        new UniqueConstraintError({ message: 'duplicate' }),
      );

      await expect(
        service.create({
          domesticBankId: 10,
          currency: 'USD',
          accountNumber: 'ACC-100',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty currency or accountNumber after trimming', async () => {
      await expect(
        service.create({
          domesticBankId: 10,
          currency: '   ',
          accountNumber: 'ACC-1',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          domesticBankId: 10,
          currency: 'USD',
          accountNumber: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when parent Domestic Bank does not exist', async () => {
      mockDomesticBankModel.findByPk.mockResolvedValue(null);

      await expect(
        service.create({
          domesticBankId: 999,
          currency: 'USD',
          accountNumber: 'ACC-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when explicit companyId does not match Domestic Bank companyId', async () => {
      mockDomesticBankModel.findByPk.mockResolvedValue({
        id: 10,
        companyId: 2,
        company: { id: 2, clientId: 1 },
      });
      mockCompanyModel.findByPk.mockResolvedValue({ id: 9, clientId: 1 });

      await expect(
        service.create({
          companyId: 9,
          domesticBankId: 10,
          currency: 'USD',
          accountNumber: 'ACC-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findLinkedNostros', () => {
    it('returns only Nostro records matching both DomesticBankId and Currency (read-only)', async () => {
      mockCurrencyAccountModel.findByPk.mockResolvedValue({
        id: 21,
        companyId: 2,
        domesticBankId: 10,
        currency: 'USD',
        accountName: 'USD Account',
        accountNumber: '112233',
        status: 'Active',
        company: { id: 2, clientId: 1, name: 'Agricom' },
        domesticBank: { id: 10, bankName: 'DBS BANK INDIA LIMITED' },
      });

      const usdNostros = [
        { id: 1, domesticBankId: 10, currency: 'USD', bankName: 'JP MORGAN' },
        { id: 2, domesticBankId: 10, currency: 'USD', bankName: 'CITI BANK' },
      ];
      mockNostroBankModel.findAll.mockResolvedValue(usdNostros);

      const res = await service.findLinkedNostros(21);

      const expectedWhere = expect.objectContaining({
        domesticBankId: 10,
      }) as Record<string, unknown>;
      expect(mockNostroBankModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          order: [['id', 'ASC']],
        }),
      );
      expect(res.domesticBankId).toBe(10);
      expect(res.currency).toBe('USD');
      expect(res.count).toBe(2);
      expect(res.rows).toHaveLength(2);
    });

    it('throws NotFoundException when Currency Account does not exist', async () => {
      mockCurrencyAccountModel.findByPk.mockResolvedValue(null);

      await expect(service.findLinkedNostros(404)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update & remove', () => {
    it('updates a currency account and allows clearing optional fields', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      const baseRecord = {
        id: 5,
        companyId: 2,
        domesticBankId: 10,
        currency: 'USD',
        accountNumber: 'ACC-5',
        iban: 'OLDIBAN',
        remarks: 'Old',
        status: 'Active',
      };
      const existingRecord = {
        ...baseRecord,
        company: { id: 2, clientId: 1 },
        update: mockUpdate,
        toJSON: () => baseRecord,
      };
      const updatedRecord = {
        ...existingRecord,
        iban: null,
        remarks: null,
        status: 'Inactive',
      };
      mockCurrencyAccountModel.findByPk
        .mockResolvedValueOnce(existingRecord)
        .mockResolvedValueOnce(updatedRecord);
      mockCurrencyAccountModel.findOne.mockResolvedValue(null);

      const res = await service.update(
        5,
        { iban: '', remarks: null, status: 'Inactive' },
        { userId: 7, clientId: 1, type: 'client_admin' },
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          iban: null,
          remarks: null,
          status: 'Inactive',
        }),
        { transaction: mockTransaction },
      );
      expect(res.status).toBe('Inactive');
      expect(mockAuditService.writeDiffLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entityId: 5 }),
      );
    });

    it('denies cross-tenant access for non-super_admin users', async () => {
      mockCurrencyAccountModel.findByPk.mockResolvedValue({
        id: 8,
        companyId: 99,
        company: { id: 99, clientId: 55 },
      });

      await expect(
        service.findOne(8, { userId: 7, clientId: 1, type: 'user' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletes a currency account and logs audit event', async () => {
      const mockDestroy = jest.fn().mockResolvedValue(undefined);
      mockCurrencyAccountModel.findByPk.mockResolvedValue({
        id: 9,
        companyId: 2,
        domesticBankId: 10,
        currency: 'EUR',
        accountNumber: 'EUR-9',
        company: { id: 2, clientId: 1 },
        destroy: mockDestroy,
        toJSON: () => ({ id: 9, currency: 'EUR', accountNumber: 'EUR-9' }),
      });

      const res = await service.remove(9, {
        userId: 7,
        clientId: 1,
        type: 'client_admin',
      });

      expect(mockDestroy).toHaveBeenCalledWith({
        transaction: mockTransaction,
      });
      expect(res.success).toBe(true);
      expect(mockAuditService.writeDiffLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityId: 9 }),
      );
    });
  });
});
