import { CurrencyAccountsController } from './currency-accounts.controller';
import { CurrencyAccountsService } from './currency-accounts.service';
import { BanksService } from './banks.service';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { CurrencyAccount } from './models/currency-account.model';
import { Company } from '../companies/models/company.model';

describe('CurrencyAccountsController & BanksService Integration', () => {
  describe('CurrencyAccountsController', () => {
    let controller: CurrencyAccountsController;
    let mockCreate: jest.Mock;
    let mockFindAll: jest.Mock;
    let mockFindLinkedNostros: jest.Mock;
    let mockFindOne: jest.Mock;
    let mockUpdate: jest.Mock;
    let mockRemove: jest.Mock;

    beforeEach(() => {
      mockCreate = jest.fn();
      mockFindAll = jest.fn();
      mockFindLinkedNostros = jest.fn();
      mockFindOne = jest.fn();
      mockUpdate = jest.fn();
      mockRemove = jest.fn();

      const mockService = {
        create: mockCreate,
        findAll: mockFindAll,
        findLinkedNostros: mockFindLinkedNostros,
        findOne: mockFindOne,
        update: mockUpdate,
        remove: mockRemove,
      } as unknown as CurrencyAccountsService;

      controller = new CurrencyAccountsController(mockService);
    });

    it('delegates CRUD and linked-nostros calls with req.user', async () => {
      const req = { user: { userId: 1, type: 'super_admin' } };

      await controller.create(
        { domesticBankId: 5, currency: 'USD', accountNumber: '12345' },
        req,
      );
      expect(mockCreate).toHaveBeenCalledWith(
        { domesticBankId: 5, currency: 'USD', accountNumber: '12345' },
        req.user,
      );

      await controller.findAll({ domesticBankId: '5' }, req);
      expect(mockFindAll).toHaveBeenCalledWith(
        { domesticBankId: '5' },
        req.user,
      );

      await controller.findLinkedNostros(12, 'Active', req);
      expect(mockFindLinkedNostros).toHaveBeenCalledWith(
        12,
        'Active',
        req.user,
      );

      await controller.findOne(12, req);
      expect(mockFindOne).toHaveBeenCalledWith(12, req.user);

      await controller.update(12, { status: 'Inactive' }, req);
      expect(mockUpdate).toHaveBeenCalledWith(
        12,
        { status: 'Inactive' },
        req.user,
      );

      await controller.remove(12, req);
      expect(mockRemove).toHaveBeenCalledWith(12, req.user);
    });
  });

  describe('BanksService integration', () => {
    it('includes currencyAccounts in findOneDomestic and cascade deletes them in removeDomestic', async () => {
      const mockDestroyBank = jest.fn().mockResolvedValue(undefined);
      const bankJson = {
        id: 10,
        bankName: 'DBS',
        nostroAccounts: [{ id: 1, currency: 'USD' }],
        currencyAccounts: [{ id: 2, currency: 'USD' }],
      };
      const mockBank = {
        id: 10,
        bankName: 'DBS',
        destroy: mockDestroyBank,
        toJSON: () => bankJson,
      };
      const mockDomesticModel = {
        findByPk: jest.fn().mockResolvedValue(mockBank),
      };
      const mockNostroDestroy = jest.fn().mockResolvedValue(1);
      const mockNostroModel = {
        destroy: mockNostroDestroy,
      };
      const mockCurrencyDestroy = jest.fn().mockResolvedValue(1);
      const mockCurrencyAccountModel = {
        destroy: mockCurrencyDestroy,
      };
      const banksService = new BanksService(
        mockDomesticModel as unknown as typeof DomesticBank,
        mockNostroModel as unknown as typeof NostroBank,
        mockCurrencyAccountModel as unknown as typeof CurrencyAccount,
        {} as typeof Company,
      );

      const rawDetail: unknown = await banksService.findOneDomestic(10);
      const detail = rawDetail as {
        linkedNostroAccounts: unknown[];
        currencyAccounts: unknown[];
      };
      expect(detail.linkedNostroAccounts).toHaveLength(1);
      expect(detail.currencyAccounts).toHaveLength(1);

      const delResult = await banksService.removeDomestic(10);
      expect(mockNostroDestroy).toHaveBeenCalledWith({
        where: { domesticBankId: 10 },
      });
      expect(mockCurrencyDestroy).toHaveBeenCalledWith({
        where: { domesticBankId: 10 },
      });
      expect(mockDestroyBank).toHaveBeenCalled();
      expect(delResult.success).toBe(true);
    });
  });
});
