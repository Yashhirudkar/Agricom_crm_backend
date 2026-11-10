export class ExchangeRateTickerItemDto {
  baseCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  effectiveDate: string;
  updatedAt: string;
  source: string;
}

export class ExchangeRateTickerResponseDto {
  rates: ExchangeRateTickerItemDto[];
  usingPreviousRates: boolean;
  hasStoredRates: boolean;
  missingCurrencies: string[];
  previousRatesDate: string | null;
}
