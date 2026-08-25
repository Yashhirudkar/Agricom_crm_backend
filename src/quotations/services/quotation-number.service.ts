import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { QuotationSequence } from '../models/quotation-sequence.model';

@Injectable()
export class QuotationNumberService {
  constructor(
    @InjectModel(QuotationSequence)
    private readonly sequenceModel: typeof QuotationSequence,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Generates the next unique quotation number for the given period.
   *
   * Strategy: single atomic Postgres upsert with RETURNING.
   *   INSERT INTO quotation_sequences (period, last_seq, created_at, updated_at)
   *     VALUES (:period, 1, NOW(), NOW())
   *   ON CONFLICT (period)
   *     DO UPDATE SET last_seq = quotation_sequences.last_seq + 1,
   *                   updated_at = NOW()
   *   RETURNING last_seq;
   *
   * This is concurrency-safe under any number of simultaneous requests:
   * Postgres guarantees that each call sees a distinct, incremented last_seq.
   *
   * @param period - YYYYMM string (e.g. "202608")
   * @param transaction - The parent Sequelize transaction. If the quotation
   *   creation fails after this call, the transaction rollback also reverts
   *   the sequence increment, preventing gaps from stranded numbers.
   * @returns Formatted quotation number, e.g. "AQ-202608-000001"
   */
  async nextNumber(period: string, transaction: Transaction): Promise<string> {
    const [result] = await this.sequelize.query<{ last_seq: number }>(
      `INSERT INTO quotation_sequences (period, last_seq, created_at, updated_at)
         VALUES (:period, 1, NOW(), NOW())
       ON CONFLICT (period)
         DO UPDATE SET last_seq   = quotation_sequences.last_seq + 1,
                       updated_at = NOW()
       RETURNING last_seq`,
      {
        replacements: { period },
        transaction,
        type: 'SELECT' as any,
      },
    );

    const lastSeq = (result as any).last_seq as number;
    return `AQ-${period}-${String(lastSeq).padStart(6, '0')}`;
  }

  /**
   * Derives the period string (YYYYMM) from the current date.
   * Always uses server time — never client-supplied.
   */
  static currentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }
}
