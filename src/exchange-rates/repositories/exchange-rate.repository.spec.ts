import { ExchangeRateRepository } from './exchange-rate.repository';
import { ExchangeRate } from '../models/exchange-rate.model';
import { Currency } from '../../masters/currency/currency.model';
import { PurchaseContract } from '../../purchase-contracts/models/purchase-contract.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';

describe('ExchangeRateRepository', () => {
  it('reports whether the exchange-rate table contains any rows', async () => {
    const exchangeRateModel = {
      count: jest.fn().mockResolvedValue(1),
    };
    const repository = new ExchangeRateRepository(
      exchangeRateModel as unknown as typeof ExchangeRate,
      {} as typeof Currency,
      {} as typeof PurchaseContract,
      {} as typeof SalesContract,
    );

    await expect(repository.hasAnyRates()).resolves.toBe(true);
    expect(exchangeRateModel.count).toHaveBeenCalledTimes(1);
  });

  it('returns the total number of stored exchange rates', async () => {
    const sequelize = {
      query: jest.fn().mockResolvedValue([{ count: '5' }]),
    };
    const exchangeRateModel = {
      sequelize,
    };
    const repository = new ExchangeRateRepository(
      exchangeRateModel as unknown as typeof ExchangeRate,
      {} as typeof Currency,
      {} as typeof PurchaseContract,
      {} as typeof SalesContract,
    );

    await expect(repository.countRates()).resolves.toBe(5);
    expect(sequelize.query).toHaveBeenCalledWith(
      'SELECT COUNT(*) FROM exchange_rates',
      expect.objectContaining({ type: expect.anything() }),
    );
  });

  it('prioritizes the required currencies when collecting sync targets', async () => {
    const sequelize = {
      query: jest.fn().mockResolvedValue([]),
    };
    const repository = new ExchangeRateRepository(
      {} as typeof ExchangeRate,
      {
        findAll: jest.fn().mockResolvedValue([]),
      } as unknown as typeof Currency,
      { sequelize } as unknown as typeof PurchaseContract,
      { sequelize } as unknown as typeof SalesContract,
    );

    await expect(repository.getCurrenciesToSync()).resolves.toEqual([
      'USD',
      'EUR',
      'GBP',
      'AED',
    ]);
  });

  it('returns only the latest rate per currency', async () => {
    const newest = {
      baseCurrency: 'USD',
      exchangeRate: '86.42',
      effectiveDate: '2026-11-10',
    } as unknown as ExchangeRate;
    const sequelize = {
      query: jest.fn().mockResolvedValue([newest]),
    };
    const exchangeRateModel = {
      sequelize,
    };
    const repository = new ExchangeRateRepository(
      exchangeRateModel as unknown as typeof ExchangeRate,
      {} as typeof Currency,
      {} as typeof PurchaseContract,
      {} as typeof SalesContract,
    );

    await expect(repository.findLatestRates([' usd '])).resolves.toEqual([
      newest,
    ]);
    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ORDER BY base_currency, effective_date DESC, updated_at DESC',
      ),
      expect.objectContaining({
        replacements: { targetCurrency: 'INR', currencies: ['USD'] },
        model: exchangeRateModel,
        mapToModel: true,
      }),
    );
  });
});
