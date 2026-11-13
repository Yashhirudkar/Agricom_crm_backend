import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Currency } from '../../masters/currency/currency.model';
import { PurchaseContract } from '../../purchase-contracts/models/purchase-contract.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { ExchangeRate } from '../models/exchange-rate.model';

export interface ExchangeRateRecord {
  baseCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  effectiveDate: string;
  source: string;
}

@Injectable()
export class ExchangeRateRepository {
  constructor(
    @InjectModel(ExchangeRate)
    private readonly exchangeRateModel: typeof ExchangeRate,
    @InjectModel(Currency)
    private readonly currencyModel: typeof Currency,
    @InjectModel(PurchaseContract)
    private readonly purchaseContractModel: typeof PurchaseContract,
    @InjectModel(SalesContract)
    private readonly salesContractModel: typeof SalesContract,
  ) {}

  async findLatestRate(currency: string): Promise<ExchangeRate | null> {
    return this.exchangeRateModel.findOne({
      where: {
        baseCurrency: currency,
        targetCurrency: 'INR',
      },
      order: [
        ['effectiveDate', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  }

  async findLatestRates(currencies: string[]): Promise<ExchangeRate[]> {
    const normalized = [
      ...new Set(currencies.map((code) => code.trim().toUpperCase())),
    ];
    if (normalized.length === 0) return [];

    return this.exchangeRateModel.sequelize.query<ExchangeRate>(
      `SELECT DISTINCT ON (base_currency) *
       FROM exchange_rates
       WHERE target_currency = :targetCurrency
         AND base_currency IN (:currencies)
       ORDER BY base_currency, effective_date DESC, updated_at DESC`,
      {
        replacements: { targetCurrency: 'INR', currencies: normalized },
        type: QueryTypes.SELECT,
        model: this.exchangeRateModel,
        mapToModel: true,
      },
    );
  }

  async hasAnyRates(): Promise<boolean> {
    return (await this.exchangeRateModel.count()) > 0;
  }

  async countRates(): Promise<number> {
    const [result] = await this.exchangeRateModel.sequelize.query<{
      count: string;
    }>('SELECT COUNT(*) FROM exchange_rates', {
      type: QueryTypes.SELECT,
    });
    return Number(result.count);
  }

  async hasRatesForDate(
    currencies: string[],
    effectiveDate: string,
  ): Promise<boolean> {
    if (currencies.length === 0) return true;

    const records = (await this.exchangeRateModel.findAll({
      where: {
        targetCurrency: 'INR',
        effectiveDate,
        baseCurrency: { [Op.in]: currencies },
      },
      attributes: ['baseCurrency'],
      raw: true,
    })) as Array<{ baseCurrency: string }>;
    const storedCurrencies = new Set(
      records.map(({ baseCurrency }) => baseCurrency),
    );
    return currencies.every((currency) => storedCurrencies.has(currency));
  }

  async getCurrenciesToSync(): Promise<string[]> {
    const [activeCurrencies, purchaseCurrencies, salesCurrencies] =
      await Promise.all([
        this.currencyModel.findAll({
          where: { isActive: true },
          attributes: ['code'],
          raw: true,
        }) as Promise<Array<{ code: string }>>,
        this.purchaseContractModel.sequelize.query<{ code: string }>(
          `SELECT DISTINCT currency_code AS code
           FROM purchase_contracts
           WHERE currency_code IS NOT NULL AND BTRIM(currency_code) <> ''`,
          { type: QueryTypes.SELECT },
        ),
        this.salesContractModel.sequelize.query<{ code: string }>(
          `SELECT DISTINCT currency_code AS code
           FROM sales_contracts
           WHERE currency_code IS NOT NULL AND BTRIM(currency_code) <> ''`,
          { type: QueryTypes.SELECT },
        ),
      ]);

    const priorityCurrencies = ['USD', 'EUR', 'GBP', 'AED'];
    const codes = new Set(priorityCurrencies);
    for (const { code } of [
      ...activeCurrencies,
      ...purchaseCurrencies,
      ...salesCurrencies,
    ]) {
      const normalized = String(code || '')
        .trim()
        .toUpperCase();
      if (/^[A-Z]{3}$/.test(normalized)) codes.add(normalized);
    }

    return [
      ...priorityCurrencies,
      ...[...codes].filter((code) => !priorityCurrencies.includes(code)).sort(),
    ];
  }

  async getCurrenciesInUse(): Promise<string[]> {
    const [purchaseCurrencies, salesCurrencies] = await Promise.all([
      this.purchaseContractModel.sequelize.query<{ code: string }>(
        `SELECT DISTINCT currency_code AS code
         FROM purchase_contracts
         WHERE currency_code IS NOT NULL AND BTRIM(currency_code) <> ''`,
        { type: QueryTypes.SELECT },
      ),
      this.salesContractModel.sequelize.query<{ code: string }>(
        `SELECT DISTINCT currency_code AS code
         FROM sales_contracts
         WHERE currency_code IS NOT NULL AND BTRIM(currency_code) <> ''`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    return [
      ...new Set(
        [...purchaseCurrencies, ...salesCurrencies]
          .map(({ code }) =>
            String(code || '')
              .trim()
              .toUpperCase(),
          )
          .filter((code) => /^[A-Z]{3}$/.test(code)),
      ),
    ].sort();
  }

  async upsertRates(rates: ExchangeRateRecord[]): Promise<void> {
    const transaction = await this.exchangeRateModel.sequelize.transaction();
    try {
      await this.exchangeRateModel.bulkCreate(rates, {
        updateOnDuplicate: ['exchangeRate', 'source', 'updatedAt'],
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
