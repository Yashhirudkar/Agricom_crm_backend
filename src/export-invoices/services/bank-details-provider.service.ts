import { Injectable } from '@nestjs/common';
import { BankDetailsSnapshot } from '../models/export-invoice.model';

export interface BankOption {
  key: string;
  name: string;
  currency: string;
  details: BankDetailsSnapshot & { formattedText?: string };
}

/**
 * Interface contract for Bank Details provider.
 * When the real Bank Master module is implemented later, it will implement
 * this exact contract (or replace this service) so that Export Invoice module
 * logic remains completely untouched.
 */
export interface IBankDetailsProvider {
  getAvailableBanks(currency?: string): Promise<BankOption[]>;
  getBankByKey(key: string): Promise<BankOption | null>;
}

@Injectable()
export class BankDetailsProviderService implements IBankDetailsProvider {
  /**
   * Dummy bank registry options matching exact physical invoice formats.
   * Can be dynamically extended or hooked into a DB table when Bank Master arrives.
   */
  private readonly dummyBanks: BankOption[] = [
    {
      key: 'EURO',
      name: 'ICICI BANK UK / ICICI BANK LTD (EURO Nostro)',
      currency: 'EUR',
      details: {
        bankName: 'ICICI BANK UK PLC GERMANY BRANCH',
        accountName: 'AGRICOM IMPEX',
        accountNumber: '00800484637',
        iban: '00800484637',
        swiftCode: 'ICICDEFFXXX',
        branch: 'GERMANY BRANCH',
        currency: 'EUR',
        additionalDetails: `NOSTRO BANK DETAILS
ICICI BANK UK PLC GERMANY BRANCH
ACCOUNT NO: 00800484637
SWIFT CODE: ICICDEFFXXX
Beneficiary Name: AGRICOM IMPEX
BANK NAME : ICICI BANK LTD
ACCOUNT NO: 624205012998
SWIFT CODE: ICICINBBCTS
ADDRESS: Akarshan Busiplex 26, Central Bazar Road, Ramdaspeth, Nagpur-440010`,
        formattedText: `NOSTRO BANK DETAILS
ICICI BANK UK PLC GERMANY BRANCH
ACCOUNT NO: 00800484637
SWIFT CODE: ICICDEFFXXX
Beneficiary Name: AGRICOM IMPEX
BANK NAME : ICICI BANK LTD
ACCOUNT NO: 624205012998
SWIFT CODE: ICICINBBCTS
ADDRESS: Akarshan Busiplex 26, Central Bazar Road, Ramdaspeth, Nagpur-440010`,
      },
    },
    {
      key: 'USD',
      name: 'JPMorgan Chase Bank, N.A. (USD Account)',
      currency: 'USD',
      details: {
        bankName: 'JPMORGAN CHASE BANK, N.A.',
        accountName: 'AGRICOM IMPEX',
        accountNumber: 'US33021000021234567890',
        iban: 'US33021000021234567890',
        swiftCode: 'CHASUS33XXX',
        branch: 'New York, USA',
        currency: 'USD',
        additionalDetails: 'Routing Transit Number (ABA): 021000021',
        formattedText: `BANK DETAILS (USD)
JPMORGAN CHASE BANK, N.A.
ACCOUNT NO: US33021000021234567890
SWIFT CODE: CHASUS33XXX
Beneficiary Name: AGRICOM IMPEX
Branch: New York, USA
ABA / Routing: 021000021`,
      },
    },
    {
      key: 'INR',
      name: 'State Bank of India (INR Account)',
      currency: 'INR',
      details: {
        bankName: 'STATE BANK OF INDIA',
        accountName: 'AGRICOM IMPEX',
        accountNumber: '40192837465',
        iban: 'IN40192837465',
        swiftCode: 'SBININBBXXX',
        branch: 'Overseas Branch, Mumbai, India',
        currency: 'INR',
        additionalDetails: 'IFSC: SBIN0004283',
        formattedText: `BANK DETAILS (INR)
STATE BANK OF INDIA
ACCOUNT NO: 40192837465
SWIFT CODE: SBININBBXXX
Beneficiary Name: AGRICOM IMPEX
Branch: Overseas Branch, Mumbai, India
IFSC CODE: SBIN0004283`,
      },
    },
  ];

  async getAvailableBanks(currency?: string): Promise<BankOption[]> {
    if (!currency) {
      return this.dummyBanks;
    }
    const curr = currency.toUpperCase().trim();
    const matched = this.dummyBanks.filter(
      (b) => b.currency.toUpperCase() === curr || b.key.toUpperCase() === curr,
    );
    return matched.length > 0 ? matched : this.dummyBanks;
  }

  async getBankByKey(key: string): Promise<BankOption | null> {
    if (!key) return null;
    const found = this.dummyBanks.find(
      (b) => b.key.toLowerCase() === key.toLowerCase(),
    );
    return found || null;
  }
}
