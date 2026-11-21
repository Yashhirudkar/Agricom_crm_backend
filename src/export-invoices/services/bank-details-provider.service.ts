import { Injectable } from '@nestjs/common';
import { BankDetailsSnapshot } from '../models/export-invoice.model';
import { BanksService } from '../../banks/banks.service';

export interface BankOption {
  key: string;
  name: string;
  currency: string;
  details: BankDetailsSnapshot & { formattedText?: string };
}

/**
 * Interface contract for Bank Details provider.
 * All bank details are fetched strictly from BanksService backed by the PostgreSQL database.
 * No hardcoded sample or fallback bank data exists.
 */
export interface IBankDetailsProvider {
  getAvailableBanks(currency?: string, companyId?: number): Promise<BankOption[]>;
  getBankByKey(key: string, companyId?: number): Promise<BankOption | null>;
}

@Injectable()
export class BankDetailsProviderService implements IBankDetailsProvider {
  constructor(private readonly banksService: BanksService) {}

  /**
   * Fetches available bank options strictly from database via BanksService.
   * If no bank is configured in the database, returns an empty array.
   * Never uses hardcoded fallback data.
   */
  async getAvailableBanks(currency?: string, companyId?: number): Promise<BankOption[]> {
    if (!this.banksService) {
      return [];
    }

    try {
      const dbOptions = await this.banksService.getBankOptions(currency, companyId);
      if (!dbOptions || dbOptions.length === 0) {
        return [];
      }

      if (currency) {
        const curr = currency.toUpperCase().trim();
        // Return only banks matching the requested currency
        return dbOptions.filter((b) => b.currency?.toUpperCase() === curr);
      }

      return dbOptions;
    } catch (err) {
      console.error('Error fetching banks from BanksService:', err);
      return [];
    }
  }

  /**
   * Finds a bank option by key strictly from the database.
   * Never returns hardcoded sample data.
   */
  async getBankByKey(key: string, companyId?: number): Promise<BankOption | null> {
    if (!key || !this.banksService) return null;

    try {
      const all = await this.banksService.getBankOptions(undefined, companyId);
      const found = all.find((b) => b.key.toLowerCase() === key.toLowerCase());
      return found || null;
    } catch (err) {
      console.error('Error finding bank by key from BanksService:', err);
      return null;
    }
  }
}
