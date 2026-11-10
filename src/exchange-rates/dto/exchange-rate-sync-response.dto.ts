export class ExchangeRateSyncResponseDto {
  success: boolean;
  recordsInserted: number;
  currencies: string[];
  exchangeRateDate: string;
  errors: string[];
}
