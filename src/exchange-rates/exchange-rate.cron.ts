import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class ExchangeRateCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRateCron.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.exchangeRateService.syncRates();
      this.logger.log(
        `Initial exchange-rate synchronization stored ${result.recordsInserted} records for ${result.exchangeRateDate}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unexpected synchronization error.';
      this.logger.error(
        `Initial exchange-rate synchronization failed: ${message}`,
      );
    }
  }

  @Cron('5 0 * * *', { timeZone: 'Asia/Kolkata' })
  async syncDailyRates(): Promise<void> {
    try {
      const result = await this.exchangeRateService.syncRates();
      this.logger.log(
        `Synchronized ${result.recordsInserted} exchange rates for ${result.exchangeRateDate}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unexpected synchronization error.';
      this.logger.error(
        `Daily exchange-rate synchronization failed; previously stored rates remain available. ${message}`,
      );
    }
  }
}
