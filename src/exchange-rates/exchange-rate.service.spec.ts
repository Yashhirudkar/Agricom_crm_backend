import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateRepository } from './repositories/exchange-rate.repository';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let repository: jest.Mocked<
    Pick<
      ExchangeRateRepository,
      | 'findLatestRate'
      | 'findLatestRates'
      | 'getCurrenciesInUse'
      | 'getCurrenciesToSync'
      | 'hasAnyRates'
      | 'hasRatesForDate'
      | 'upsertRates'
    >
  >;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    repository = {
      findLatestRate: jest.fn(),
      findLatestRates: jest.fn(),
      getCurrenciesInUse: jest.fn(),
      getCurrenciesToSync: jest
        .fn()
        .mockResolvedValue(['USD', 'EUR', 'GBP', 'AED']),
      hasAnyRates: jest.fn().mockResolvedValue(true),
      hasRatesForDate: jest.fn().mockResolvedValue(false),
      upsertRates: jest.fn().mockResolvedValue(undefined),
    };
    httpService = { get: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('test-key') };
    service = new ExchangeRateService(
      configService as unknown as ConfigService,
      httpService as unknown as HttpService,
      repository as unknown as ExchangeRateRepository,
    );
  });

  it('returns the latest stored numeric rate without making an HTTP request', async () => {
    repository.findLatestRate.mockResolvedValue({
      exchangeRate: '86.42',
    } as never);

    await expect(service.getLatestRate('usd')).resolves.toBe(86.42);
    expect(repository.findLatestRate).toHaveBeenCalledWith('USD');
    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('returns database rates only for currencies currently used in contracts', async () => {
    repository.getCurrenciesInUse.mockResolvedValue(['EUR', 'USD']);
    repository.findLatestRates.mockResolvedValue([
      {
        baseCurrency: 'EUR',
        targetCurrency: 'INR',
        exchangeRate: '99.18',
        effectiveDate: '2026-11-09',
        updatedAt: new Date('2026-11-09T18:35:00.000Z'),
        source: 'ExchangeRate.host',
      },
    ] as never);

    await expect(service.getTickerRates()).resolves.toEqual({
      rates: [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'INR',
          exchangeRate: 99.18,
          effectiveDate: '2026-11-09',
          updatedAt: '2026-11-09T18:35:00.000Z',
          source: 'ExchangeRate.host',
        },
      ],
      usingPreviousRates: true,
      hasStoredRates: true,
      missingCurrencies: ['USD'],
      previousRatesDate: '2026-11-09',
    });
    expect(repository.findLatestRates).toHaveBeenCalledWith(['EUR', 'USD']);
    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('inverts INR-source live quotes before storing currency-to-INR rates', async () => {
    httpService.get.mockReturnValue(
      of({
        status: 200,
        data: {
          success: true,
          source: 'INR',
          timestamp: Date.UTC(2026, 10, 10) / 1000,
          quotes: {
            INRUSD: 0.01,
            INREUR: 0.02,
            INRGBP: 0.025,
            INRAED: 0.04,
          },
        },
      }),
    );

    const result = await service.syncRates();
    const storedRates = repository.upsertRates.mock.calls[0][0];

    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.exchangerate.host/live',
      expect.objectContaining({
        params: expect.objectContaining({
          access_key: 'test-key',
          source: 'INR',
          currencies: 'USD,EUR,GBP,AED',
        }),
      }),
    );
    expect(storedRates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ baseCurrency: 'USD', exchangeRate: 100 }),
        expect.objectContaining({ baseCurrency: 'EUR', exchangeRate: 50 }),
        expect.objectContaining({ baseCurrency: 'GBP', exchangeRate: 40 }),
        expect.objectContaining({ baseCurrency: 'AED', exchangeRate: 25 }),
        expect.objectContaining({ baseCurrency: 'INR', exchangeRate: 1 }),
      ]),
    );
    expect(result).toEqual({
      success: true,
      recordsInserted: 5,
      currencies: ['USD', 'EUR', 'GBP', 'AED'],
      exchangeRateDate: '2026-11-10',
      errors: [],
    });
    expect(repository.hasRatesForDate).toHaveBeenCalled();
  });

  it('skips the live API when rates for all required currencies are already current', async () => {
    repository.hasRatesForDate.mockResolvedValue(true);

    await expect(service.syncRates()).resolves.toMatchObject({
      success: true,
      recordsInserted: 0,
      exchangeRateDate: expect.any(String),
    });
    expect(httpService.get).not.toHaveBeenCalled();
    expect(repository.upsertRates).not.toHaveBeenCalled();
  });

  it('forces a live refresh when requested even if rates are already current', async () => {
    repository.hasRatesForDate.mockResolvedValue(true);
    httpService.get.mockReturnValue(
      of({
        status: 200,
        data: {
          success: true,
          source: 'INR',
          timestamp: Date.UTC(2026, 10, 10) / 1000,
          quotes: {
            INRUSD: 0.01,
            INREUR: 0.02,
            INRGBP: 0.025,
            INRAED: 0.04,
          },
        },
      }),
    );

    await service.syncRates(true);

    expect(repository.hasRatesForDate).not.toHaveBeenCalled();
    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(repository.upsertRates).toHaveBeenCalledTimes(1);
  });

  it('reports whether any rates are stored and dates used in the ticker response', async () => {
    repository.getCurrenciesInUse.mockResolvedValue([]);
    repository.findLatestRates.mockResolvedValue([]);
    repository.hasAnyRates.mockResolvedValue(false);

    await expect(service.getTickerRates()).resolves.toEqual({
      rates: [],
      usingPreviousRates: false,
      hasStoredRates: false,
      missingCurrencies: [],
      previousRatesDate: null,
    });
  });

  it('retains existing database rates when the external API fails', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('Request failed with status code 503')),
    );

    await expect(service.syncRates()).rejects.toThrow(
      new ServiceUnavailableException(
        'Exchange-rate synchronization failed. Previously stored rates were retained.',
      ),
    );
    expect(repository.upsertRates).not.toHaveBeenCalled();
  });
});
