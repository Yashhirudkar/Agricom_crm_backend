import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ExchangeRate } from './models/exchange-rate.model';
import {
  ExchangeRateRecord,
  ExchangeRateRepository,
} from './repositories/exchange-rate.repository';
import { ExchangeRateSyncResponseDto } from './dto/exchange-rate-sync-response.dto';
import { ExchangeRateTickerResponseDto } from './dto/exchange-rate-ticker-response.dto';

interface ExchangeRateHostResponse {
  success?: boolean;
  source?: string;
  date?: string;
  timestamp?: number;
  quotes?: Record<string, number | string>;
  rates?: Record<string, number | string>;
}

interface HttpErrorResponse {
  status?: unknown;
  data?: unknown;
}

const API_URL = 'https://api.exchangerate.host/live';
const TARGET_CURRENCY = 'INR';
const SOURCE = 'ExchangeRate.host';

function getHttpErrorResponse(error: unknown): HttpErrorResponse | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('response' in error) ||
    typeof error.response !== 'object' ||
    error.response === null
  ) {
    return undefined;
  }

  const response = error.response;
  return {
    status: 'status' in response ? response.status : undefined,
    data: 'data' in response ? response.data : undefined,
  };
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly repository: ExchangeRateRepository,
  ) {}

  async getLatestRate(currency: string): Promise<number | null> {
    const rate = await this.repository.findLatestRate(
      currency.trim().toUpperCase(),
    );
    return rate ? Number(rate.exchangeRate) : null;
  }

  async getLatestRates(currencies: string[]): Promise<ExchangeRate[]> {
    return this.repository.findLatestRates(currencies);
  }

  async getTickerRates(): Promise<ExchangeRateTickerResponseDto> {
    const currencies = await this.repository.getCurrenciesInUse();
    const [records, hasStoredRates] = await Promise.all([
      this.repository.findLatestRates(currencies),
      this.repository.hasAnyRates(),
    ]);
    const rates = records.map((record) => ({
      baseCurrency: record.baseCurrency,
      targetCurrency: record.targetCurrency,
      exchangeRate: Number(record.exchangeRate),
      effectiveDate: record.effectiveDate,
      updatedAt: record.updatedAt.toISOString(),
      source: record.source,
    }));
    const foundCurrencies = new Set(rates.map((rate) => rate.baseCurrency));
    const missingCurrencies = currencies.filter(
      (currency) =>
        currency !== TARGET_CURRENCY && !foundCurrencies.has(currency),
    );
    if (missingCurrencies.length > 0) {
      this.logger.warn(
        `No stored exchange rates found for currencies currently used in contracts: ${missingCurrencies.join(', ')}.`,
      );
    }
    if (!hasStoredRates) {
      this.logger.warn(
        'No exchange-rate records are stored in exchange_rates.',
      );
    }

    const today = this.getTodayInIndia();
    const previousRates = rates
      .map((rate) => rate.effectiveDate)
      .filter((effectiveDate) => effectiveDate < today)
      .sort();

    return {
      rates,
      usingPreviousRates: previousRates.length > 0,
      hasStoredRates,
      missingCurrencies,
      previousRatesDate: previousRates[0] || null,
    };
  }

  async syncRates(): Promise<ExchangeRateSyncResponseDto> {
    let apiKey: string | undefined;
    let requestUrl = API_URL;
    try {
      apiKey = this.configService.get<string>('EXCHANGE_RATE_API_KEY')?.trim();
      this.logger.log(`API Key Loaded: ${apiKey ? 'YES' : 'NO'}`);
      if (!apiKey) {
        throw new Error('EXCHANGE_RATE_API_KEY is not configured.');
      }

      const currencies = await this.repository.getCurrenciesToSync();
      const requestedCurrencies = currencies.filter(
        (currency) => currency !== TARGET_CURRENCY,
      );
      const requestParams = new URLSearchParams({
        source: TARGET_CURRENCY,
        currencies: requestedCurrencies.join(','),
      });
      requestUrl = `${API_URL}?access_key=[REDACTED]&${requestParams.toString()}`;
      this.logger.log(`Request URL: ${requestUrl}`);
      this.logger.log('HTTP Method: GET');
      this.logger.log('Headers: {"Accept":"application/json"}');

      const { data, status } = await firstValueFrom(
        this.httpService.get<ExchangeRateHostResponse>(API_URL, {
          params: {
            access_key: apiKey,
            source: TARGET_CURRENCY,
            currencies: requestedCurrencies.join(','),
          },
          headers: { Accept: 'application/json' },
          timeout: 10000,
        }),
      );
      this.logger.log(`HTTP Status Code: ${status}`);
      this.logger.log(
        `Full API Response Body: ${this.serializeApiBody(data, apiKey)}`,
      );
      if (status < 200 || status >= 300) {
        throw new Error(`ExchangeRate.host returned HTTP ${status}.`);
      }

      const quotes = data.quotes || data.rates;
      this.logger.log(
        `ExchangeRate.host response: success=${data.success !== false}, source=${data.source || 'unspecified'}, quotes=${Object.keys(quotes || {}).length}.`,
      );
      if (data.success === false || !quotes) {
        throw new Error('ExchangeRate.host returned an unsuccessful response.');
      }
      if (data.source && data.source.toUpperCase() !== TARGET_CURRENCY) {
        throw new Error(
          'ExchangeRate.host returned an unexpected source currency.',
        );
      }

      const effectiveDate =
        data.date ||
        (data.timestamp
          ? new Date(data.timestamp * 1000).toISOString().slice(0, 10)
          : null);
      if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
        throw new Error(
          'ExchangeRate.host returned an invalid effective date.',
        );
      }

      const rates: ExchangeRateRecord[] = [
        {
          baseCurrency: TARGET_CURRENCY,
          targetCurrency: TARGET_CURRENCY,
          exchangeRate: 1,
          effectiveDate,
          source: SOURCE,
        },
      ];
      const missingCurrencies: string[] = [];

      for (const currency of requestedCurrencies) {
        const quote =
          quotes[`${TARGET_CURRENCY}${currency}`] ?? quotes[currency];
        const currencyPerInr = Number(quote);
        if (!Number.isFinite(currencyPerInr) || currencyPerInr <= 0) {
          missingCurrencies.push(currency);
          continue;
        }
        rates.push({
          baseCurrency: currency,
          targetCurrency: TARGET_CURRENCY,
          exchangeRate: Number((1 / currencyPerInr).toFixed(10)),
          effectiveDate,
          source: SOURCE,
        });
      }

      if (rates.length === 1 && requestedCurrencies.length > 0) {
        throw new Error('ExchangeRate.host returned no valid currency quotes.');
      }
      if (missingCurrencies.length > 0) {
        this.logger.warn(
          `ExchangeRate.host did not return rates for: ${missingCurrencies.join(', ')}.`,
        );
      }

      const savedCurrencies = rates
        .map((rate) => rate.baseCurrency)
        .filter((currency) => currency !== TARGET_CURRENCY);
      this.logger.log(`Parsed currencies: ${savedCurrencies.join(', ')}`);
      await this.repository.upsertRates(rates);
      const totalRecords = await this.repository.countRates();
      this.logger.log(
        `Exchange rates inserted: ${savedCurrencies.map((currency) => `${currency} -> ${TARGET_CURRENCY}`).join(', ')}`,
      );
      this.logger.log(`SELECT COUNT(*) FROM exchange_rates: ${totalRecords}`);
      this.logger.log(
        `Stored ${rates.length} exchange rates for ${effectiveDate}; missing currencies: ${missingCurrencies.length}.`,
      );
      return {
        success: true,
        recordsInserted: rates.length,
        currencies: savedCurrencies,
        exchangeRateDate: effectiveDate,
        errors: missingCurrencies.map(
          (currency) => `No exchange rate returned for ${currency}.`,
        ),
      };
    } catch (error) {
      const response = getHttpErrorResponse(error);
      if (response) {
        const status =
          typeof response.status === 'number' ? response.status : 'unavailable';
        this.logger.error(`Request URL: ${requestUrl}`);
        this.logger.error('HTTP Method: GET');
        this.logger.error('Headers: {"Accept":"application/json"}');
        this.logger.error(`HTTP Status Code: ${status}`);
        this.logger.error(
          `Full API Response Body: ${this.serializeApiBody(response.data, apiKey || '')}`,
        );
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Unexpected synchronization error.';
      const safeMessage = this.serializeApiBody(message, apiKey || '');
      this.logger.error(
        `Exchange-rate synchronization failed; existing rates were retained. ${safeMessage}`,
      );
      throw new ServiceUnavailableException(
        'Exchange-rate synchronization failed. Previously stored rates were retained.',
      );
    }
  }

  private serializeApiBody(body: unknown, apiKey: string): string {
    let serialized: string;
    if (typeof body === 'string') {
      serialized = body;
    } else {
      try {
        serialized = JSON.stringify(body) ?? String(body);
      } catch {
        serialized = String(body);
      }
    }

    return apiKey ? serialized.split(apiKey).join('[REDACTED]') : serialized;
  }

  private getTodayInIndia(): string {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      dateParts.map(({ type, value }) => [type, value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }
}
