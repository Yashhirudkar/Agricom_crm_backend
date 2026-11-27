import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ExchangeRateService } from '../../../exchange-rates/exchange-rate.service';
import { Partner } from '../partner.model';
import { DnbOcrService, DocumentExtractionResult } from './dnb-ocr.service';
import { parseAnnualSalesFromText } from './annual-sales-parser.util';
import { resolveAnnualSalesCurrency } from './currency-detector.util';
import {
  DNB_CONFIDENCE_REVIEW_THRESHOLD,
  cleanCompanyNameCandidate,
  isTruncatedCompanyName,
  isUiChromeOrNoise,
  isValidCityName,
  normalizeAndValidateCountry,
  sanitizeIndustryValue,
} from './dnb-field-validators.util';
import {
  normalizeDateToIso,
  normalizeDunsNumber,
  parseFullDnbReport,
} from './dnb-report-parser.util';
import {
  DnbDuplicatePartnerMatch,
  DnbFullReportExtractionResponse,
  ParsedDnbReport,
} from './dnb-import.types';

export type DnbImportStatus =
  | 'SUCCESS'
  | 'NOT_DETECTED'
  | 'CURRENCY_NOT_DETECTED'
  | 'EXCHANGE_RATE_FAILED';

export interface DnbAnnualSalesExtractionResponse {
  success: boolean;
  status: DnbImportStatus;
  detectedAmount: number | null;
  detectedAmountFormatted: string | null;
  detectedCurrency: string | null;
  detectedValueDisplay: string | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  isFallbackRate: boolean;
  convertedAmountInr: number | null;
  labelMatched: string | null;
  rawMatchedText: string | null;
  ocrEngine: string;
  message: string;
  warning: string | null;
}

@Injectable()
export class DnbImportService {
  private readonly logger = new Logger(DnbImportService.name);

  constructor(
    private readonly dnbOcrService: DnbOcrService,
    private readonly exchangeRateService: ExchangeRateService,
    @Optional()
    @InjectModel(Partner)
    private readonly partnerModel?: typeof Partner,
  ) {}

  async extractAnnualSales(
    file: Express.Multer.File,
  ): Promise<DnbAnnualSalesExtractionResponse> {
    const extraction = await this.dnbOcrService.extractDocumentContent(file);

    const parsed = this.resolveParsedSales(extraction);

    if (!parsed.found || parsed.amount === null || !Number.isFinite(parsed.amount)) {
      return {
        success: false,
        status: 'NOT_DETECTED',
        detectedAmount: null,
        detectedAmountFormatted: null,
        detectedCurrency: null,
        detectedValueDisplay: null,
        exchangeRate: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
        isFallbackRate: false,
        convertedAmountInr: null,
        labelMatched: null,
        rawMatchedText: null,
        ocrEngine: extraction.engine,
        message: 'Unable to detect Annual Sales.',
        warning: 'Please enter the value manually.',
      };
    }

    const detectedAmountFormatted = this.formatDetectedAmount(parsed.amount);
    const currencyResult = resolveAnnualSalesCurrency({
      explicitHint: parsed.currencyHint,
      matchedSnippet: parsed.rawMatchedText,
      contextSnippet: parsed.rawMatchedText,
      documentText: extraction.text,
    });

    if (!currencyResult.currency) {
      return {
        success: false,
        status: 'CURRENCY_NOT_DETECTED',
        detectedAmount: parsed.amount,
        detectedAmountFormatted,
        detectedCurrency: null,
        detectedValueDisplay: detectedAmountFormatted,
        exchangeRate: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
        isFallbackRate: false,
        convertedAmountInr: null,
        labelMatched: parsed.labelMatched,
        rawMatchedText: parsed.rawMatchedText,
        ocrEngine: extraction.engine,
        message: 'Unable to detect currency for Annual Sales.',
        warning:
          'Detected numeric amount, but currency could not be identified. Please enter the INR value manually.',
      };
    }

    try {
      const conversion = await this.exchangeRateService.convertAmountToInr(
        parsed.amount,
        currencyResult.currency,
      );

      return {
        success: true,
        status: 'SUCCESS',
        detectedAmount: parsed.amount,
        detectedAmountFormatted,
        detectedCurrency: conversion.currency,
        detectedValueDisplay: `${detectedAmountFormatted} ${conversion.currency}`,
        exchangeRate: conversion.exchangeRate,
        exchangeRateDate: conversion.effectiveDate,
        exchangeRateSource: conversion.source,
        isFallbackRate: conversion.isFallbackRate,
        convertedAmountInr: conversion.convertedAmountInr,
        labelMatched: parsed.labelMatched,
        rawMatchedText: parsed.rawMatchedText,
        ocrEngine: extraction.engine,
        message: 'OCR Completed Successfully',
        warning: conversion.isFallbackRate
          ? `Using last stored FX rate (${conversion.effectiveDate}).`
          : null,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Exchange rate service unavailable.';
      this.logger.warn(
        `Exchange conversion failed for ${parsed.amount} ${currencyResult.currency}: ${errorMsg}`,
      );

      return {
        success: false,
        status: 'EXCHANGE_RATE_FAILED',
        detectedAmount: parsed.amount,
        detectedAmountFormatted,
        detectedCurrency: currencyResult.currency,
        detectedValueDisplay: `${detectedAmountFormatted} ${currencyResult.currency}`,
        exchangeRate: null,
        exchangeRateDate: null,
        exchangeRateSource: null,
        isFallbackRate: false,
        convertedAmountInr: null,
        labelMatched: parsed.labelMatched,
        rawMatchedText: parsed.rawMatchedText,
        ocrEngine: extraction.engine,
        message: `Exchange rate unavailable for ${currencyResult.currency} to INR.`,
        warning: 'Please convert and enter the INR value manually.',
      };
    }
  }

  async extractFullReport(
    file: Express.Multer.File,
    options: { companyId?: number; excludePartnerId?: number } = {},
  ): Promise<DnbFullReportExtractionResponse> {
    const extraction = await this.dnbOcrService.extractDocumentContent(file);
    const baseSource = extraction.engine === 'pdf-text' ? 'PDF_TEXT' : 'OCR_TEXT';
    const report = parseFullDnbReport(
      extraction.text,
      extraction.lines,
      baseSource,
    );

    // Overlay optional AI Vision structured fields when available
    if (extraction.structuredHint?.visionFields) {
      this.mergeAiVisionFields(report, extraction.structuredHint.visionFields);
    }

    const warnings: string[] = [];

    // Convert Annual Sales to INR
    const salesAmt = report.financial.annualSalesOriginal.value;
    const salesCurrency = report.financial.originalCurrency.value;

    if (salesAmt !== null && Number.isFinite(salesAmt)) {
      const formattedSales = this.formatDetectedAmount(salesAmt);
      if (salesCurrency) {
        report.financial.detectedValueDisplay = `${formattedSales} ${salesCurrency}`;
        try {
          const conversion = await this.exchangeRateService.convertAmountToInr(
            salesAmt,
            salesCurrency,
          );
          report.financial.annualSalesInr = {
            value: conversion.convertedAmountInr,
            confidence: report.financial.annualSalesOriginal.confidence,
            source: 'DERIVED',
            rawText: report.financial.detectedValueDisplay,
            needsReview:
              report.financial.annualSalesOriginal.needsReview ||
              report.financial.originalCurrency.needsReview,
          };
          report.financial.exchangeRate = conversion.exchangeRate;
          report.financial.exchangeRateDate = conversion.effectiveDate;
          report.financial.exchangeRateSource = conversion.source;
          report.financial.isFallbackRate = conversion.isFallbackRate;
          if (conversion.isFallbackRate) {
            warnings.push(
              `Using last stored FX rate for ${salesCurrency} (${conversion.effectiveDate}).`,
            );
          }
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : `Exchange rate unavailable for ${salesCurrency} to INR.`;
          warnings.push(msg);
        }
      } else {
        report.financial.detectedValueDisplay = formattedSales;
        warnings.push(
          'Annual Sales amount detected, but currency could not be identified. Please verify INR value manually.',
        );
      }
    } else {
      warnings.push(
        'Annual Sales was not detected in this report. You can still enter it manually.',
      );
    }

    // Convert Credit Limit to INR if foreign currency detected
    const creditAmt = report.risk.creditLimitOriginal.value;
    const creditCurrency =
      report.risk.creditLimitCurrency.value || salesCurrency;

    if (creditAmt !== null && Number.isFinite(creditAmt)) {
      if (creditCurrency) {
        if (!report.risk.creditLimitCurrency.value) {
          report.risk.creditLimitCurrency = {
            value: creditCurrency,
            confidence: 72,
            source: 'DERIVED',
            rawText: null,
            needsReview: true,
          };
        }
        try {
          const conv = await this.exchangeRateService.convertAmountToInr(
            creditAmt,
            creditCurrency,
          );
          report.risk.creditLimitInr = {
            value: conv.convertedAmountInr,
            confidence: report.risk.creditLimitOriginal.confidence,
            source: 'DERIVED',
            rawText: `${this.formatDetectedAmount(creditAmt)} ${creditCurrency}`,
            needsReview: report.risk.creditLimitOriginal.needsReview,
          };
        } catch {
          // Non-fatal: keep original credit limit visible even if FX fails
        }
      }
    }

    const extractedCount = this.countExtractedFields(report);
    const duplicateMatch = await this.findDuplicatePartner(
      report,
      options.companyId,
      options.excludePartnerId,
    );

    const status =
      extractedCount === 0
        ? 'NOT_DETECTED'
        : warnings.length > 0 && report.financial.annualSalesInr.value === null
          ? 'PARTIAL'
          : 'SUCCESS';

    const message =
      extractedCount === 0
        ? 'Unable to extract D&B fields from this document. Please fill the fields manually.'
        : 'OCR Completed Successfully';

    return {
      success: extractedCount > 0,
      status,
      ocrEngine: extraction.engine,
      pageCount: extraction.pageCount || 1,
      extractedCount,
      message,
      warnings,
      report,
      duplicateMatch,
    };
  }

  async findDuplicatePartner(
    report: ParsedDnbReport,
    companyId?: number,
    excludePartnerId?: number,
  ): Promise<DnbDuplicatePartnerMatch> {
    if (!this.partnerModel) {
      return {
        found: false,
        matchType: null,
        matchedValue: null,
        partner: null,
      };
    }

    const duns = report.companyInfo.dunsNumber.value;
    const dunsDigits = duns ? duns.replace(/\D/g, '') : null;
    const vatOrReg =
      report.companyInfo.vatNumber.value ||
      report.companyInfo.registrationNumber.value ||
      null;
    const companyName = report.companyInfo.companyName.value;

    const baseWhere: any = { isActive: true };
    if (companyId) baseWhere.companyId = companyId;
    if (excludePartnerId && Number.isInteger(excludePartnerId)) {
      baseWhere.id = { [Op.ne]: excludePartnerId };
    }

    const attributes = [
      'id',
      'entityName',
      'country',
      'city',
      'taxId',
      'annualTurnover',
      'yearOfEstablishment',
      'partnerRoleId',
    ];

    try {
      // 1. Primary duplicate check: D-U-N-S Number (stored in productNotes reference or taxId)
      if (duns && dunsDigits) {
        const dunsMatch = await this.partnerModel.findOne({
          where: {
            ...baseWhere,
            [Op.or]: [
              { productNotes: { [Op.iLike]: `%${duns}%` } },
              { productNotes: { [Op.iLike]: `%${dunsDigits}%` } },
              { taxId: { [Op.iLike]: `%${duns}%` } },
              { taxId: { [Op.iLike]: `%${dunsDigits}%` } },
            ],
          },
          attributes,
        });
        if (dunsMatch) {
          return {
            found: true,
            matchType: 'DUNS',
            matchedValue: duns,
            partner: this.serializePartnerMatch(dunsMatch),
          };
        }
      }

      // 2. Secondary check: VAT / Registration Number matching taxId
      if (vatOrReg && vatOrReg.trim().length >= 4) {
        const cleanTax = vatOrReg.trim();
        const taxMatch = await this.partnerModel.findOne({
          where: {
            ...baseWhere,
            taxId: { [Op.iLike]: cleanTax },
          },
          attributes,
        });
        if (taxMatch) {
          return {
            found: true,
            matchType: 'VAT_TAX_ID',
            matchedValue: cleanTax,
            partner: this.serializePartnerMatch(taxMatch),
          };
        }
      }

      // 3. Tertiary check: exact Entity Name match
      if (companyName && companyName.trim().length >= 3) {
        const cleanName = companyName.trim();
        const nameMatch = await this.partnerModel.findOne({
          where: {
            ...baseWhere,
            entityName: { [Op.iLike]: cleanName },
          },
          attributes,
        });
        if (nameMatch) {
          return {
            found: true,
            matchType: 'COMPANY_NAME',
            matchedValue: cleanName,
            partner: this.serializePartnerMatch(nameMatch),
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        `Duplicate partner check skipped: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return {
      found: false,
      matchType: null,
      matchedValue: null,
      partner: null,
    };
  }

  private serializePartnerMatch(partner: Partner) {
    return {
      id: partner.id,
      entityName: partner.entityName,
      country: partner.country,
      city: partner.city || null,
      taxId: partner.taxId || null,
      annualTurnover:
        partner.annualTurnover != null ? Number(partner.annualTurnover) : null,
      yearOfEstablishment: partner.yearOfEstablishment || null,
      partnerRoleId: partner.partnerRoleId,
    };
  }

  private mergeAiVisionFields(
    report: ParsedDnbReport,
    vision: Record<string, any>,
  ): void {
    const canUpgrade = (target: {
      value: unknown;
      confidence: number;
      needsReview: boolean;
    }) =>
      target.value === null ||
      target.value === undefined ||
      target.value === '' ||
      target.needsReview ||
      target.confidence < DNB_CONFIDENCE_REVIEW_THRESHOLD;

    const applyStr = (
      target: { value: string | null; confidence: number; source: any; needsReview: boolean },
      raw: unknown,
      conf = 92,
      sanitizer?: (v: string) => string | null,
    ) => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      if (!canUpgrade(target)) return;
      const sanitized = sanitizer
        ? sanitizer(raw)
        : isUiChromeOrNoise(raw)
          ? null
          : raw.trim();
      if (!sanitized) return;
      target.value = sanitized;
      target.confidence = conf;
      target.source = 'AI_VISION';
      target.needsReview = conf < DNB_CONFIDENCE_REVIEW_THRESHOLD;
    };

    const applyNum = (
      target: { value: number | null; confidence: number; source: any; needsReview: boolean },
      raw: unknown,
      conf = 92,
    ) => {
      if (raw === null || raw === undefined || !canUpgrade(target)) return;
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) {
        target.value = num;
        target.confidence = conf;
        target.source = 'AI_VISION';
        target.needsReview = conf < DNB_CONFIDENCE_REVIEW_THRESHOLD;
      }
    };

    if (typeof vision.companyName === 'string') {
      const cleanComp = cleanCompanyNameCandidate(vision.companyName);
      if (
        cleanComp &&
        (canUpgrade(report.companyInfo.companyName) ||
          (isTruncatedCompanyName(report.companyInfo.companyName.value) &&
            !isTruncatedCompanyName(cleanComp)))
      ) {
        const compConf = isTruncatedCompanyName(cleanComp) ? 68 : 94;
        report.companyInfo.companyName.value = cleanComp;
        report.companyInfo.companyName.confidence = compConf;
        report.companyInfo.companyName.source = 'AI_VISION';
        report.companyInfo.companyName.needsReview =
          compConf < DNB_CONFIDENCE_REVIEW_THRESHOLD;
      }
    }

    applyStr(report.companyInfo.tradeName, vision.tradeName, 90);
    if (canUpgrade(report.companyInfo.dunsNumber) && typeof vision.dunsNumber === 'string') {
      const duns = normalizeDunsNumber(vision.dunsNumber);
      if (duns) applyStr(report.companyInfo.dunsNumber, duns, 96);
    }
    applyStr(report.companyInfo.registrationNumber, vision.registrationNumber, 90);
    applyStr(report.companyInfo.vatNumber, vision.vatNumber, 90);
    applyStr(report.companyInfo.legalForm, vision.legalForm, 88);
    applyStr(report.companyInfo.ownership, vision.ownership, 86);
    applyStr(report.companyInfo.companyStatus, vision.companyStatus, 88);
    applyStr(report.companyInfo.headquarters, vision.headquarters, 86);
    applyStr(report.companyInfo.branchIndicator, vision.branchIndicator, 86);

    applyStr(report.address.fullAddress, vision.fullAddress, 92);
    applyStr(report.address.street, vision.street, 90);
    applyStr(report.address.area, vision.area, 86);
    applyStr(report.address.city, vision.city, 92, (v) =>
      isValidCityName(v) ? v.trim() : null,
    );
    applyStr(report.address.stateProvince, vision.stateProvince, 88);
    applyStr(
      report.address.country,
      vision.country,
      94,
      normalizeAndValidateCountry,
    );
    applyStr(report.address.postalCode, vision.postalCode, 92);

    if (canUpgrade(report.address.fullAddress)) {
      const rebuilt = [
        report.address.street.value,
        report.address.postalCode.value,
        report.address.city.value,
        report.address.stateProvince.value,
        report.address.country.value,
      ]
        .filter(Boolean)
        .join(', ');
      if (rebuilt) {
        report.address.fullAddress.value = rebuilt;
        report.address.fullAddress.confidence = 90;
        report.address.fullAddress.source = 'AI_VISION';
        report.address.fullAddress.needsReview = false;
      }
    }

    applyStr(report.contact.phone, vision.phone, 92);
    applyStr(report.contact.mobile, vision.mobile, 90);
    applyStr(report.contact.email, vision.email, 94);
    applyStr(report.contact.website, vision.website, 92);
    applyStr(report.contact.fax, vision.fax, 90);

    applyStr(
      report.business.lineOfBusiness,
      vision.lineOfBusiness,
      88,
      sanitizeIndustryValue,
    );
    applyStr(
      report.business.industry,
      vision.industry,
      90,
      sanitizeIndustryValue,
    );
    applyStr(report.business.businessDescription, vision.businessDescription, 86);
    applyStr(report.business.sicCode, vision.sicCode, 92);
    applyStr(report.business.naicsCode, vision.naicsCode, 92);

    applyNum(report.financial.annualSalesOriginal, vision.annualSales, 95);
    if (
      typeof vision.currency === 'string' &&
      vision.currency.trim() &&
      canUpgrade(report.financial.originalCurrency)
    ) {
      applyStr(
        report.financial.originalCurrency,
        vision.currency.trim().toUpperCase(),
        95,
      );
    }
    if (
      canUpgrade(report.financial.latestFinancialDate) &&
      typeof vision.latestFinancialDate === 'string'
    ) {
      const iso = normalizeDateToIso(vision.latestFinancialDate);
      if (iso) applyStr(report.financial.latestFinancialDate, iso, 90);
    }

    applyNum(report.employees.employeeCount, vision.employeeCount, 94);
    applyNum(report.companyAge.yearEstablished, vision.yearEstablished, 94);
    if (
      canUpgrade(report.companyAge.incorporationDate) &&
      typeof vision.incorporationDate === 'string'
    ) {
      const inc = normalizeDateToIso(vision.incorporationDate);
      if (inc) applyStr(report.companyAge.incorporationDate, inc, 90);
    }

    applyStr(report.risk.dnbRating, vision.dnbRating, 92);
    applyNum(report.risk.failureScore, vision.failureScore, 93);
    applyNum(report.risk.paydex, vision.paydex, 94);
    applyNum(report.risk.delinquencyScore, vision.delinquencyScore, 90);
    applyNum(report.risk.financialStressScore, vision.financialStressScore, 88);
    applyNum(report.risk.creditLimitOriginal, vision.creditLimit, 92);
    if (
      typeof vision.creditLimitCurrency === 'string' &&
      vision.creditLimitCurrency.trim() &&
      canUpgrade(report.risk.creditLimitCurrency)
    ) {
      applyStr(
        report.risk.creditLimitCurrency,
        vision.creditLimitCurrency.trim().toUpperCase(),
        92,
      );
    }
    applyStr(report.risk.riskRecommendation, vision.riskRecommendation, 86);

    applyStr(report.parent.parentCompany, vision.parentCompany, 90);
    applyStr(report.parent.globalParent, vision.globalParent, 90);
    applyStr(report.parent.ultimateParent, vision.ultimateParent, 90);

    if (report.directors.length === 0 && Array.isArray(vision.directors)) {
      for (const dir of vision.directors.slice(0, 6)) {
        if (dir && typeof dir.name === 'string' && dir.name.trim()) {
          report.directors.push({
            name: dir.name.trim(),
            role: typeof dir.role === 'string' && dir.role.trim() ? dir.role.trim() : null,
            confidence: 90,
          });
        }
      }
    }

    applyStr(report.additional.importExportStatus, vision.importExportStatus, 86);
    applyStr(report.additional.ownershipType, vision.ownershipType, 86);
    applyStr(report.additional.publicPrivate, vision.publicPrivate, 86);
    applyNum(report.additional.numberOfBranches, vision.numberOfBranches, 88);
    applyStr(report.additional.legalEvents, vision.legalEvents, 84);
    applyStr(report.additional.bankruptcyStatus, vision.bankruptcyStatus, 86);
    applyStr(
      report.additional.businessActivity,
      vision.businessActivity,
      86,
      sanitizeIndustryValue,
    );
  }

  private countExtractedFields(report: ParsedDnbReport): number {
    const scalarFields = [
      report.companyInfo.companyName,
      report.companyInfo.tradeName,
      report.companyInfo.dunsNumber,
      report.companyInfo.registrationNumber,
      report.companyInfo.vatNumber,
      report.companyInfo.legalForm,
      report.companyInfo.ownership,
      report.companyInfo.companyStatus,
      report.companyInfo.headquarters,
      report.companyInfo.branchIndicator,
      report.address.fullAddress,
      report.address.city,
      report.address.country,
      report.address.postalCode,
      report.contact.phone,
      report.contact.mobile,
      report.contact.email,
      report.contact.website,
      report.contact.fax,
      report.business.lineOfBusiness,
      report.business.industry,
      report.business.businessDescription,
      report.business.sicCode,
      report.business.naicsCode,
      report.financial.annualSalesOriginal,
      report.financial.originalCurrency,
      report.financial.latestFinancialDate,
      report.employees.employeeCount,
      report.companyAge.yearEstablished,
      report.risk.dnbRating,
      report.risk.failureScore,
      report.risk.paydex,
      report.risk.delinquencyScore,
      report.risk.financialStressScore,
      report.risk.creditLimitOriginal,
      report.risk.riskClass,
      report.risk.riskRecommendation,
      report.parent.parentCompany,
      report.parent.globalParent,
      report.parent.ultimateParent,
      report.additional.importExportStatus,
      report.additional.ownershipType,
      report.additional.publicPrivate,
      report.additional.numberOfBranches,
      report.additional.legalEvents,
      report.additional.bankruptcyStatus,
      report.additional.businessActivity,
    ];
    return (
      scalarFields.filter((f) => f.value !== null && f.value !== undefined && f.value !== '').length +
      (report.directors.length > 0 ? 1 : 0)
    );
  }

  private resolveParsedSales(extraction: DocumentExtractionResult) {
    const hint = extraction.structuredHint;
    if (
      hint &&
      hint.amount !== null &&
      hint.amount !== undefined &&
      Number.isFinite(Number(hint.amount)) &&
      Number(hint.amount) > 0
    ) {
      return {
        found: true,
        amount: Number(hint.amount),
        currencyHint: hint.currency || null,
        labelMatched: hint.labelMatched || 'Annual Sales',
        rawMatchedText: hint.rawMatchedText || null,
      };
    }

    return parseAnnualSalesFromText(extraction.text, extraction.lines);
  }

  private formatDetectedAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}
