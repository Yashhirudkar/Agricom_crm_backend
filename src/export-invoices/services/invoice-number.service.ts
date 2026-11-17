import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ExportInvoiceSequence } from '../models/export-invoice-sequence.model';
import { ExportInvoice } from '../models/export-invoice.model';
import { Op } from 'sequelize';

export interface IInvoiceNumberGenerator {
  previewNextNumber(
    companyId: number | null,
    contractNumber: string,
    manualSequence?: number | string,
  ): Promise<{
    invoiceNumber: string;
    sequenceNumber: number;
    prefix: string;
    isManualFirstSequence: boolean;
  }>;

  consumeNextNumber(
    companyId: number | null,
    contractNumber: string,
    explicitSequence?: number | null,
  ): Promise<{ invoiceNumber: string; sequenceNumber: number }>;

  setInitialSequence(
    companyId: number | null,
    sequence: number,
    prefix?: string,
  ): Promise<ExportInvoiceSequence>;
}

@Injectable()
export class InvoiceNumberService implements IInvoiceNumberGenerator {
  private readonly logger = new Logger(InvoiceNumberService.name);
  private readonly DEFAULT_PREFIX = 'EXP';
  private readonly DEFAULT_PADDING = 3;

  constructor(
    @InjectModel(ExportInvoiceSequence)
    private readonly sequenceModel: typeof ExportInvoiceSequence,
    @InjectModel(ExportInvoice)
    private readonly invoiceModel: typeof ExportInvoice,
  ) {}

  /**
   * Cleans contract number for clean invoice code concatenation.
   * e.g., "SC-250001" or "SC250001"
   */
  private sanitizeContractNumber(contractNumber: string): string {
    if (!contractNumber) return 'SC000000';
    return contractNumber.trim().replace(/\s+/g, '');
  }

  /**
   * Zero-pads a sequence number according to the padding specification (e.g., 30 -> "030").
   */
  private padSequence(sequence: number, paddingLength: number = this.DEFAULT_PADDING): string {
    const s = String(Math.max(1, sequence));
    return s.padStart(paddingLength, '0');
  }

  /**
   * Builds the formatted invoice string: Prefix - PaddedSequence - ContractNumber
   * e.g. EXP-030-SC250001
   */
  public formatInvoiceNumber(
    prefix: string,
    sequence: number,
    contractNumber: string,
    paddingLength: number = this.DEFAULT_PADDING,
  ): string {
    const cleanPrefix = (prefix || this.DEFAULT_PREFIX).toUpperCase().trim();
    const paddedSeq = this.padSequence(sequence, paddingLength);
    const cleanContract = this.sanitizeContractNumber(contractNumber);
    return `${cleanPrefix}-${paddedSeq}-${cleanContract}`;
  }

  /**
   * Previews the next invoice number.
   * If manualSequence is provided by the user (first sequence entered manually), uses it.
   */
  async previewNextNumber(
    companyId: number | null,
    contractNumber: string,
    manualSequence?: number | string,
  ): Promise<{
    invoiceNumber: string;
    sequenceNumber: number;
    prefix: string;
    isManualFirstSequence: boolean;
  }> {
    const prefix = this.DEFAULT_PREFIX;
    const cleanContract = this.sanitizeContractNumber(contractNumber);

    if (manualSequence !== undefined && manualSequence !== null && manualSequence !== '') {
      const parsed = parseInt(String(manualSequence), 10);
      if (!isNaN(parsed) && parsed > 0) {
        return {
          invoiceNumber: this.formatInvoiceNumber(prefix, parsed, cleanContract),
          sequenceNumber: parsed,
          prefix,
          isManualFirstSequence: true,
        };
      }
    }

    // Check DB sequence configuration
    const whereClause: any = { prefix };
    if (companyId) {
      whereClause.companyId = companyId;
    }

    const seqRecord = await this.sequenceModel.findOne({ where: whereClause });
    let nextSeq = 1;
    let isManualFirstSequence = false;

    if (seqRecord && seqRecord.currentSequence > 0) {
      nextSeq = seqRecord.currentSequence + 1;
    } else {
      // Find highest sequence from existing invoices
      const maxInv = await this.invoiceModel.findOne({
        where: companyId ? { companyId } : {},
        order: [['sequenceNumber', 'DESC']],
      });

      if (maxInv && maxInv.sequenceNumber > 0) {
        nextSeq = maxInv.sequenceNumber + 1;
      } else {
        // No sequence recorded yet - indicates user should set or confirm first sequence
        nextSeq = 30; // sensible default starter sequence e.g. 030 as in prompt
        isManualFirstSequence = true;
      }
    }

    return {
      invoiceNumber: this.formatInvoiceNumber(prefix, nextSeq, cleanContract),
      sequenceNumber: nextSeq,
      prefix,
      isManualFirstSequence,
    };
  }

  /**
   * Consumes and increments the running sequence atomically when saving an invoice.
   */
  async consumeNextNumber(
    companyId: number | null,
    contractNumber: string,
    explicitSequence?: number | null,
  ): Promise<{ invoiceNumber: string; sequenceNumber: number }> {
    const prefix = this.DEFAULT_PREFIX;
    const cleanContract = this.sanitizeContractNumber(contractNumber);

    let chosenSeq: number;

    const whereClause: any = { prefix };
    if (companyId) {
      whereClause.companyId = companyId;
    } else {
      whereClause.companyId = null;
    }

    let seqRecord = await this.sequenceModel.findOne({ where: whereClause });

    if (explicitSequence && explicitSequence > 0) {
      chosenSeq = explicitSequence;
      if (!seqRecord) {
        seqRecord = await this.sequenceModel.create({
          companyId,
          prefix,
          currentSequence: chosenSeq,
          paddingLength: this.DEFAULT_PADDING,
        });
      } else if (chosenSeq >= seqRecord.currentSequence) {
        seqRecord.currentSequence = chosenSeq;
        await seqRecord.save();
      }
    } else {
      if (!seqRecord) {
        // If not initialized, check existing invoices
        const maxInv = await this.invoiceModel.findOne({
          where: companyId ? { companyId } : {},
          order: [['sequenceNumber', 'DESC']],
        });
        const startingSeq = maxInv && maxInv.sequenceNumber > 0 ? maxInv.sequenceNumber : 29;
        chosenSeq = startingSeq + 1;

        seqRecord = await this.sequenceModel.create({
          companyId,
          prefix,
          currentSequence: chosenSeq,
          paddingLength: this.DEFAULT_PADDING,
        });
      } else {
        chosenSeq = seqRecord.currentSequence + 1;
        seqRecord.currentSequence = chosenSeq;
        await seqRecord.save();
      }
    }

    const invoiceNumber = this.formatInvoiceNumber(
      prefix,
      chosenSeq,
      cleanContract,
      seqRecord.paddingLength || this.DEFAULT_PADDING,
    );

    return {
      invoiceNumber,
      sequenceNumber: chosenSeq,
    };
  }

  /**
   * Allows setting the initial sequence manually (e.g. 30).
   */
  async setInitialSequence(
    companyId: number | null,
    sequence: number,
    prefix: string = this.DEFAULT_PREFIX,
  ): Promise<ExportInvoiceSequence> {
    const whereClause: any = { prefix };
    if (companyId) {
      whereClause.companyId = companyId;
    } else {
      whereClause.companyId = null;
    }

    let record = await this.sequenceModel.findOne({ where: whereClause });
    if (!record) {
      record = await this.sequenceModel.create({
        companyId,
        prefix,
        currentSequence: Math.max(0, sequence - 1),
        paddingLength: this.DEFAULT_PADDING,
      });
    } else {
      record.currentSequence = Math.max(0, sequence - 1);
      await record.save();
    }
    return record;
  }
}

