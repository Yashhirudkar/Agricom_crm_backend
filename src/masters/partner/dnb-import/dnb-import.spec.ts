import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import sharp from 'sharp';
import { parseAnnualSalesFromText, parseLocalizedNumericValue } from './annual-sales-parser.util';
import { resolveAnnualSalesCurrency, detectCurrencyInSnippet } from './currency-detector.util';
import { parseFullDnbReport } from './dnb-report-parser.util';
import { DnbOcrService } from './dnb-ocr.service';
import { DnbImportService } from './dnb-import.service';
import { ExchangeRateService } from '../../../exchange-rates/exchange-rate.service';
import { ExchangeRateRepository } from '../../../exchange-rates/repositories/exchange-rate.repository';

describe('D&B Report AI Import & Annual Sales Auto-Fill', () => {
  describe('Currency Detection Utility', () => {
    it('detects common ISO codes and currency symbols', () => {
      expect(detectCurrencyInSnippet('308,528.44 EUR')).toBe('EUR');
      expect(detectCurrencyInSnippet('28,132,730.84 USD')).toBe('USD');
      expect(detectCurrencyInSnippet('£ 4,250,000')).toBe('GBP');
      expect(detectCurrencyInSnippet('12,500,000 PLN')).toBe('PLN');
      expect(detectCurrencyInSnippet('9,200,000 zł')).toBe('PLN');
      expect(detectCurrencyInSnippet('CHF 1,450,000')).toBe('CHF');
      expect(detectCurrencyInSnippet('AED 3,800,000')).toBe('AED');
      expect(detectCurrencyInSnippet('CA$ 2,100,000')).toBe('CAD');
      expect(detectCurrencyInSnippet('A$ 4,700,000')).toBe('AUD');
      expect(detectCurrencyInSnippet('₹ 15,00,000')).toBe('INR');
      expect(detectCurrencyInSnippet('€5,109,343.09')).toBe('EUR');
    });

    it('avoids false positives on English words matching ambiguous ISO codes', () => {
      const doc = 'All figures shown in this report are top quality estimates.';
      expect(detectCurrencyInSnippet('All figures', doc, false)).toBeNull();
      expect(
        resolveAnnualSalesCurrency({
          explicitHint: null,
          matchedSnippet: 'Annual Sales 450,000',
          contextSnippet: 'All figures are annual estimates',
          documentText: doc,
        }).currency,
      ).toBeNull();
    });

    it('falls back to document header currency declaration when line omits currency', () => {
      const doc = 'D&B Credit Summary\nAll figures in PLN\nAnnual Sales\n4,500,000';
      const result = resolveAnnualSalesCurrency({
        explicitHint: null,
        matchedSnippet: 'Annual Sales 4,500,000',
        contextSnippet: 'Annual Sales\n4,500,000',
        documentText: doc,
      });
      expect(result.currency).toBe('PLN');
      expect(result.source).toBe('DOCUMENT_HEADER');
    });
  });

  describe('Annual Sales Parser', () => {
    it('parses localized numeric formats accurately', () => {
      expect(parseLocalizedNumericValue('308,528.44')).toBe(308528.44);
      expect(parseLocalizedNumericValue('5,109,343.09')).toBe(5109343.09);
      expect(parseLocalizedNumericValue('5.109.343,09')).toBe(5109343.09);
      expect(parseLocalizedNumericValue('5 109 343,09')).toBe(5109343.09);
      expect(parseLocalizedNumericValue('28,132,730.84')).toBe(28132730.84);
    });

    it('extracts multi-line Annual Sales examples from D&B reports', () => {
      const case1 = parseAnnualSalesFromText('D&B Report\nAnnual Sales\n308,528.44 EUR\nEmployees: 12');
      expect(case1.found).toBe(true);
      expect(case1.amount).toBe(308528.44);
      expect(case1.currencyHint).toBe('EUR');

      const case2 = parseAnnualSalesFromText('Annual Sales\n5,109,343.09 EUR');
      expect(case2.found).toBe(true);
      expect(case2.amount).toBe(5109343.09);
      expect(case2.currencyHint).toBe('EUR');

      const case3 = parseAnnualSalesFromText('Annual Sales\n28,132,730.84 USD');
      expect(case3.found).toBe(true);
      expect(case3.amount).toBe(28132730.84);
      expect(case3.currencyHint).toBe('USD');
    });

    it('extracts Sales, Turnover, and Revenue labels with symbols and scale suffixes', () => {
      const turnover = parseAnnualSalesFromText('Key Metrics\nTurnover: £ 1,850,000.50');
      expect(turnover.found).toBe(true);
      expect(turnover.amount).toBe(1850000.5);
      expect(turnover.currencyHint).toBe('GBP');

      const revenue = parseAnnualSalesFromText('Operating Revenue\n$28.13M');
      expect(revenue.found).toBe(true);
      expect(revenue.amount).toBe(28130000);
      expect(revenue.currencyHint).toBe('USD');

      const thousands = parseAnnualSalesFromText("Annual Sales (in '000 CHF)\n1,250.5");
      expect(thousands.found).toBe(true);
      expect(thousands.amount).toBe(1250500);
      expect(thousands.currencyHint).toBe('CHF');
    });

    it('extracts accurately from multi-column spatial OCR boxes without bleeding neighboring columns', () => {
      const boxes = [
        { text: 'Employees', x0: 40, y0: 100, x1: 160, y1: 124, page: 1 },
        { text: 'Annual Sales', x0: 260, y0: 100, x1: 420, y1: 124, page: 1 },
        { text: 'Credit Limit', x0: 520, y0: 100, x1: 680, y1: 124, page: 1 },
        { text: '42', x0: 40, y0: 140, x1: 80, y1: 164, page: 1 },
        { text: '308,528.44 EUR', x0: 260, y0: 140, x1: 460, y1: 164, page: 1 },
        { text: '50,000 EUR', x0: 520, y0: 140, x1: 660, y1: 164, page: 1 },
      ];
      const text = boxes.map((b) => b.text).join('\n');
      const parsed = parseAnnualSalesFromText(text, boxes);
      expect(parsed.found).toBe(true);
      expect(parsed.amount).toBe(308528.44);
      expect(parsed.currencyHint).toBe('EUR');
    });

    it('ignores Sales Tax, percentages, dates, employee counts, postal codes, and returns not-found gracefully', () => {
      const text = 'Report Date: 31.12.2024\nSales Tax ID: 987654\nSales Growth: 14.5%\nEmployees\n39\nPostal Code\n5153\nPAYDEX: 80';
      const parsed = parseAnnualSalesFromText(text);
      expect(parsed.found).toBe(false);
      expect(parsed.amount).toBeNull();
    });

    it('never picks Employees 39, 125, 2025, or 5153 in stacked/tabular text layouts', () => {
      const stacked = [
        'Annual Sales',
        '28,132,730.84',
        '(EUR)',
        'Employees',
        '39',
        'Postal Code',
        '5153',
        'Year Started',
        '2025',
      ].join('\n');
      const res = parseAnnualSalesFromText(stacked);
      expect(res.found).toBe(true);
      expect(res.amount).toBe(28132730.84);
      expect(res.currencyHint).toBe('EUR');

      const onlyEmployeesText = 'Annual Sales\nEmployees\n39\nPostal Code\n5153';
      const rejected = parseAnnualSalesFromText(onlyEmployeesText);
      expect(rejected.found).toBe(false);
      expect(rejected.amount).toBeNull();
    });
  });

  describe('DnbOcrService (Images & PDFs)', () => {
    let ocrService: DnbOcrService;

    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
      const httpService = { post: jest.fn() } as unknown as HttpService;
      ocrService = new DnbOcrService(configService, httpService);
    });

    afterEach(async () => {
      await ocrService.onModuleDestroy();
    });

    const createMockReportImage = async (format: 'png' | 'jpeg' | 'webp', label: string, value: string) => {
      const svg = `<svg width="900" height="320" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="320" fill="#ffffff"/>
        <text x="40" y="70" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#111111">Dun &amp; Bradstreet Business Report</text>
        <text x="40" y="150" font-family="Arial, sans-serif" font-size="24" fill="#333333">${label}</text>
        <text x="40" y="210" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#000000">${value}</text>
      </svg>`;
      const pipeline = sharp(Buffer.from(svg));
      if (format === 'jpeg') return pipeline.jpeg({ quality: 95 }).toBuffer();
      if (format === 'webp') return pipeline.webp({ quality: 95 }).toBuffer();
      return pipeline.png().toBuffer();
    };

    it('performs real offline OCR on PNG, JPG, and WEBP report screenshots', async () => {
      const pngBuffer = await createMockReportImage('png', 'Annual Sales', '308,528.44 EUR');
      const pngResult = await ocrService.extractDocumentContent({
        originalname: 'report.png',
        mimetype: 'image/png',
        size: pngBuffer.length,
        buffer: pngBuffer,
      } as Express.Multer.File);
      const parsedPng = parseAnnualSalesFromText(pngResult.text, pngResult.lines);
      expect(parsedPng.found).toBe(true);
      expect(parsedPng.amount).toBe(308528.44);
      expect(parsedPng.currencyHint).toBe('EUR');

      const webpBuffer = await createMockReportImage('webp', 'Annual Sales', '28,132,730.84 USD');
      const webpResult = await ocrService.extractDocumentContent({
        originalname: 'screenshot.webp',
        mimetype: 'image/webp',
        size: webpBuffer.length,
        buffer: webpBuffer,
      } as Express.Multer.File);
      const parsedWebp = parseAnnualSalesFromText(webpResult.text, webpResult.lines);
      expect(parsedWebp.found).toBe(true);
      expect(parsedWebp.amount).toBe(28132730.84);
      expect(parsedWebp.currencyHint).toBe('USD');
    }, 30000);

    it('extracts 28,132,730.84 (EUR) from multi-card D&B dashboard screenshots and never picks Employees 39', async () => {
      // Case A: Annual Sales card next to Employees: 39 and D-U-N-S: 31-528-9042
      const multiCardSvg = `<svg width="1100" height="420" xmlns="http://www.w3.org/2000/svg">
        <rect width="1100" height="420" fill="#f8fafc"/>
        <rect x="20" y="20" width="330" height="160" rx="8" fill="#ffffff"/>
        <text x="40" y="65" font-size="18" font-family="Arial" fill="#64748b">Annual Sales</text>
        <text x="40" y="115" font-size="28" font-weight="bold" font-family="Arial" fill="#0f172a">28,132,730.84 (EUR)</text>
        <rect x="380" y="20" width="330" height="160" rx="8" fill="#ffffff"/>
        <text x="400" y="65" font-size="18" font-family="Arial" fill="#64748b">Employees</text>
        <text x="400" y="115" font-size="28" font-weight="bold" font-family="Arial" fill="#0f172a">39</text>
        <rect x="740" y="20" width="330" height="160" rx="8" fill="#ffffff"/>
        <text x="760" y="65" font-size="18" font-family="Arial" fill="#64748b">D-U-N-S</text>
        <text x="760" y="115" font-size="28" font-weight="bold" font-family="Arial" fill="#0f172a">31-528-9042</text>
      </svg>`;
      const bufA = await sharp(Buffer.from(multiCardSvg)).png().toBuffer();
      const ocrA = await ocrService.extractDocumentContent({
        originalname: 'dnb-cards-a.png',
        mimetype: 'image/png',
        size: bufA.length,
        buffer: bufA,
      } as Express.Multer.File);
      const parsedA = parseAnnualSalesFromText(ocrA.text, ocrA.lines);
      expect(parsedA.found).toBe(true);
      expect(parsedA.amount).toBe(28132730.84);
      expect(parsedA.currencyHint).toBe('EUR');

      // Case B: Employees 39 on the LEFT card and Annual Sales / 28,132,730.84 / (EUR) stacked on the RIGHT card
      const reversedCardSvg = `<svg width="950" height="320" xmlns="http://www.w3.org/2000/svg">
        <rect width="950" height="320" fill="#ffffff"/>
        <text x="40" y="65" font-size="20" font-family="Arial" fill="#64748b">Employees</text>
        <text x="40" y="115" font-size="30" font-weight="bold" font-family="Arial" fill="#0f172a">39</text>
        <text x="360" y="65" font-size="20" font-family="Arial" fill="#64748b">Annual Sales</text>
        <text x="360" y="115" font-size="30" font-weight="bold" font-family="Arial" fill="#0f172a">28,132,730.84</text>
        <text x="360" y="155" font-size="22" font-family="Arial" fill="#334155">(EUR)</text>
      </svg>`;
      const bufB = await sharp(Buffer.from(reversedCardSvg)).png().toBuffer();
      const ocrB = await ocrService.extractDocumentContent({
        originalname: 'dnb-cards-b.png',
        mimetype: 'image/png',
        size: bufB.length,
        buffer: bufB,
      } as Express.Multer.File);
      const parsedB = parseAnnualSalesFromText(ocrB.text, ocrB.lines);
      expect(parsedB.found).toBe(true);
      expect(parsedB.amount).toBe(28132730.84);
      expect(parsedB.currencyHint).toBe('EUR');
    }, 30000);

    it('extracts text cleanly from valid PDF files', async () => {
      // Minimal valid PDF containing "Annual Sales" and "5,109,343.09 EUR"
      const streamBody = 'BT /F1 14 Tf 50 720 Td (Annual Sales) Tj 0 -24 Td (5,109,343.09 EUR) Tj ET';
      const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
        `4 0 obj << /Length ${Buffer.byteLength(streamBody)} >> stream\n${streamBody}\nendstream endobj\n`,
        '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
      ];
      let pdf = '%PDF-1.4\n';
      const offsets: number[] = [];
      for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += obj;
      }
      const xrefOffset = Buffer.byteLength(pdf);
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (const off of offsets) {
        pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
      }
      pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      const pdfBuffer = Buffer.from(pdf, 'latin1');

      const result = await ocrService.extractDocumentContent({
        originalname: 'dnb-report.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        buffer: pdfBuffer,
      } as Express.Multer.File);

      expect(result.engine).toBe('pdf-text');
      const parsed = parseAnnualSalesFromText(result.text, result.lines);
      expect(parsed.found).toBe(true);
      expect(parsed.amount).toBe(5109343.09);
      expect(parsed.currencyHint).toBe('EUR');
    });

    it('rejects unsupported file formats and corrupted image buffers gracefully', async () => {
      await expect(
        ocrService.extractDocumentContent({
          originalname: 'bad.txt',
          mimetype: 'text/plain',
          size: 12,
          buffer: Buffer.from('hello world!'),
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);

      await expect(
        ocrService.extractDocumentContent({
          originalname: 'corrupt.png',
          mimetype: 'image/png',
          size: 16,
          buffer: Buffer.from('not-really-a-png'),
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ExchangeRateService.convertAmountToInr & DnbImportService', () => {
    let exchangeRateService: ExchangeRateService;
    let repository: jest.Mocked<
      Pick<
        ExchangeRateRepository,
        | 'findLatestRate'
        | 'findLatestRates'
        | 'getCurrenciesInUse'
        | 'getCurrenciesToSync'
        | 'hasAnyRates'
        | 'hasRatesForDate'
        | 'upsertRates'
      >
    >;
    let httpService: { get: jest.Mock; post: jest.Mock };
    let configService: { get: jest.Mock };

    beforeEach(() => {
      repository = {
        findLatestRate: jest.fn(),
        findLatestRates: jest.fn(),
        getCurrenciesInUse: jest.fn(),
        getCurrenciesToSync: jest.fn(),
        hasAnyRates: jest.fn(),
        hasRatesForDate: jest.fn(),
        upsertRates: jest.fn().mockResolvedValue(undefined),
      };
      httpService = { get: jest.fn(), post: jest.fn() };
      configService = { get: jest.fn().mockReturnValue('test-key') };
      exchangeRateService = new ExchangeRateService(
        configService as unknown as ConfigService,
        httpService as unknown as HttpService,
        repository as unknown as ExchangeRateRepository,
      );
    });

    it('returns INR amounts unchanged without calling external exchange API', async () => {
      const res = await exchangeRateService.convertAmountToInr(1250000.456, 'INR');
      expect(res.currency).toBe('INR');
      expect(res.exchangeRate).toBe(1);
      expect(res.convertedAmountInr).toBe(1250000.46);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('fetches live rate on-demand when not cached for today and converts to INR', async () => {
      repository.findLatestRate.mockResolvedValue(null);
      httpService.get.mockReturnValue(
        of({
          status: 200,
          data: {
            success: true,
            source: 'INR',
            date: '2026-11-27',
            quotes: { INRPLN: 0.04 }, // 1 PLN = 25 INR
          },
        }),
      );

      const res = await exchangeRateService.convertAmountToInr(1000, 'PLN');
      expect(res.currency).toBe('PLN');
      expect(res.exchangeRate).toBe(25);
      expect(res.convertedAmountInr).toBe(25000);
      expect(repository.upsertRates).toHaveBeenCalledWith([
        expect.objectContaining({
          baseCurrency: 'PLN',
          targetCurrency: 'INR',
          exchangeRate: 25,
        }),
      ]);
    });

    it('falls back to stored DB rate when live exchange API fails, or throws if none stored', async () => {
      repository.findLatestRate.mockResolvedValue({
        exchangeRate: '92.5',
        effectiveDate: '2026-11-20',
        source: 'ExchangeRate.host',
      } as never);
      httpService.get.mockReturnValue(throwError(() => new Error('API down')));

      const fallbackRes = await exchangeRateService.convertAmountToInr(100, 'EUR');
      expect(fallbackRes.convertedAmountInr).toBe(9250);
      expect(fallbackRes.isFallbackRate).toBe(true);

      repository.findLatestRate.mockResolvedValue(null);
      await expect(exchangeRateService.convertAmountToInr(100, 'CHF')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns graceful NOT_DETECTED and EXCHANGE_RATE_FAILED statuses in DnbImportService without crashing', async () => {
      const mockOcr = {
        extractDocumentContent: jest.fn(),
      } as unknown as DnbOcrService;
      const importService = new DnbImportService(mockOcr, exchangeRateService);

      (mockOcr.extractDocumentContent as jest.Mock).mockResolvedValue({
        text: 'Company Profile\nPAYDEX: 85\nRating: EE1',
        lines: [],
        engine: 'tesseract-ocr',
      });

      const notDetected = await importService.extractAnnualSales({} as Express.Multer.File);
      expect(notDetected.success).toBe(false);
      expect(notDetected.status).toBe('NOT_DETECTED');
      expect(notDetected.message).toBe('Unable to detect Annual Sales.');

      (mockOcr.extractDocumentContent as jest.Mock).mockResolvedValue({
        text: 'Annual Sales\n308,528.44 PLN',
        lines: [],
        engine: 'tesseract-ocr',
      });
      repository.findLatestRate.mockResolvedValue(null);
      httpService.get.mockReturnValue(throwError(() => new Error('Offline')));

      const fxFailed = await importService.extractAnnualSales({} as Express.Multer.File);
      expect(fxFailed.success).toBe(false);
      expect(fxFailed.status).toBe('EXCHANGE_RATE_FAILED');
      expect(fxFailed.detectedAmount).toBe(308528.44);
      expect(fxFailed.detectedCurrency).toBe('PLN');
      expect(fxFailed.detectedValueDisplay).toBe('308,528.44 PLN');
    });

    it('runs end-to-end screenshot OCR -> Annual Sales parser -> Currency detection -> INR conversion', async () => {
      const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
      const realOcr = new DnbOcrService(configService, httpService as unknown as HttpService);
      repository.findLatestRate.mockResolvedValue({
        exchangeRate: '98.72',
        effectiveDate: '2026-11-27',
        source: 'ExchangeRate.host',
      } as never);

      const svg = `<svg width="900" height="320" xmlns="http://www.w3.org/2000/svg">
        <rect width="900" height="320" fill="#ffffff"/>
        <text x="40" y="140" font-family="Arial, sans-serif" font-size="24" fill="#333333">Annual Sales</text>
        <text x="40" y="195" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#000000">308,528.44 EUR</text>
      </svg>`;
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      try {
        const importService = new DnbImportService(realOcr, exchangeRateService);
        const result = await importService.extractAnnualSales({
          originalname: 'dnb-capture.png',
          mimetype: 'image/png',
          size: pngBuffer.length,
          buffer: pngBuffer,
        } as Express.Multer.File);

        expect(result.success).toBe(true);
        expect(result.status).toBe('SUCCESS');
        expect(result.detectedAmount).toBe(308528.44);
        expect(result.detectedCurrency).toBe('EUR');
        expect(result.detectedValueDisplay).toBe('308,528.44 EUR');
        expect(result.convertedAmountInr).toBe(30457927.6);
      } finally {
        await realOcr.onModuleDestroy();
      }
    }, 30000);

    it('extracts complete multi-section D&B fields, confidence scores, and multi-language labels', () => {
      const fullSample = [
        'Company Name: AGRICOM POLSKA SP. Z O.O.',
        'Trade Name: Agricom Trade',
        'D-U-N-S Number: 31-528-9042',
        'Registration Number: KRS 0000123456',
        'VAT Number: PL5250001122',
        'Legal Form: Sp. z o.o.',
        'Ownership: Private',
        'Company Status: Active',
        'Headquarters: Warsaw',
        'Branch Indicator: Headquarters',
        'Address: ul. Przemyslowa 14, 00-450 Warsaw, Poland',
        'Phone: +48 22 654 32 10',
        'Email: info@agricom.pl',
        'Website: www.agricom.pl',
        'Line of Business: Wholesale Agricultural Commodities',
        'Industry: Agricultural Trade',
        'SIC Code: 5153',
        'NAICS Code: 424510',
        'Annual Sales: 28,132,730.84 (EUR)',
        'Latest Financial Statement Date: 31.12.2025',
        'Employees: 39',
        'Year Established: 1998',
        'D&B Rating: 2A 1',
        'Failure Score: 86',
        'PAYDEX Score: 79',
        'Delinquency Score: 82',
        'Financial Stress Score: 75',
        'Credit Limit: 500,000 EUR',
        'Risk Class: Low Risk',
        'Risk Recommendation: Credit can be considered',
        'Parent Company: Agricom Holdings Europe GmbH',
        'Ultimate Parent: Global Agri Group NV',
        'Directors: Jan Kowalski (Managing Director), Anna Nowak (Director)',
        'Import / Export: Imports & Exports',
        'Number of Branches: 3',
        'Bankruptcy Status: None',
      ].join('\n');

      const parsed = parseFullDnbReport(fullSample, [], 'OCR_TEXT');
      expect(parsed.companyInfo.companyName.value).toBe('AGRICOM POLSKA SP. Z O.O.');
      expect(parsed.companyInfo.dunsNumber.value).toBe('31-528-9042');
      expect(parsed.companyInfo.vatNumber.value).toBe('PL5250001122');
      expect(parsed.address.country.value).toBe('Poland');
      expect(parsed.address.postalCode.value).toBe('00-450');
      expect(parsed.contact.phone.value).toBe('+48 22 654 32 10');
      expect(parsed.contact.email.value).toBe('info@agricom.pl');
      expect(parsed.contact.website.value).toBe('https://www.agricom.pl');
      expect(parsed.business.sicCode.value).toBe('5153');
      expect(parsed.business.naicsCode.value).toBe('424510');
      expect(parsed.financial.annualSalesOriginal.value).toBe(28132730.84);
      expect(parsed.financial.originalCurrency.value).toBe('EUR');
      expect(parsed.financial.latestFinancialDate.value).toBe('2025-12-31');
      expect(parsed.employees.employeeCount.value).toBe(39);
      expect(parsed.companyAge.yearEstablished.value).toBe(1998);
      expect(parsed.risk.dnbRating.value).toBe('2A 1');
      expect(parsed.risk.failureScore.value).toBe(86);
      expect(parsed.risk.paydex.value).toBe(79);
      expect(parsed.risk.creditLimitOriginal.value).toBe(500000);
      expect(parsed.risk.riskClass.value).toBe('LOW');
      expect(parsed.parent.parentCompany.value).toBe('Agricom Holdings Europe GmbH');
      expect(parsed.directors.length).toBe(2);
      expect(parsed.directors[0].name).toBe('Jan Kowalski');
      expect(parsed.additional.numberOfBranches.value).toBe(3);

      // Multi-language (German) label test
      const germanSample = [
        'Company Name: Nordholz GmbH',
        'Rechtsform: GmbH',
        'Gründungsjahr: 2005',
        'Mitarbeiter: 48',
        'Jahresumsatz: 4.500.000,00 EUR',
      ].join('\n');
      const deParsed = parseFullDnbReport(germanSample, [], 'OCR_TEXT');
      expect(deParsed.companyInfo.legalForm.value).toBe('GmbH');
      expect(deParsed.companyAge.yearEstablished.value).toBe(2005);
      expect(deParsed.employees.employeeCount.value).toBe(48);
      expect(deParsed.financial.annualSalesOriginal.value).toBe(4500000);
      expect(deParsed.financial.originalCurrency.value).toBe('EUR');
    });

    it('merges multi-page PDF reports and detects duplicate D-U-N-S partners', async () => {
      const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
      const realOcr = new DnbOcrService(configService, httpService as unknown as HttpService);
      repository.findLatestRate.mockResolvedValue({
        exchangeRate: '95',
        effectiveDate: '2026-11-27',
        source: 'ExchangeRate.host',
      } as never);

      const mockPartnerModel = {
        findOne: jest.fn().mockResolvedValue({
          id: 42,
          entityName: 'AGRICOM POLSKA SP. Z O.O.',
          country: 'Poland',
          city: 'Warsaw',
          taxId: 'PL5250001122',
          annualTurnover: 1000000,
          yearOfEstablishment: 1998,
          partnerRoleId: 2,
        }),
      } as any;

      // Build a 2-page PDF: Page 1 has Company Info + DUNS, Page 2 has Annual Sales + Employees + Risk
      const stream1 = 'BT /F1 12 Tf 40 740 Td (Company Name: AGRICOM POLSKA SP. Z O.O.) Tj 0 -20 Td (D-U-N-S: 31-528-9042) Tj 0 -20 Td (Country: Poland) Tj ET';
      const stream2 = 'BT /F1 12 Tf 40 740 Td (Annual Sales: 28,132,730.84 EUR) Tj 0 -20 Td (Employees: 39) Tj 0 -20 Td (PAYDEX Score: 81) Tj ET';
      const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj\n',
        '4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj\n',
        `5 0 obj << /Length ${Buffer.byteLength(stream1)} >> stream\n${stream1}\nendstream endobj\n`,
        `6 0 obj << /Length ${Buffer.byteLength(stream2)} >> stream\n${stream2}\nendstream endobj\n`,
        '7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
      ];
      let pdf = '%PDF-1.4\n';
      const offsets: number[] = [];
      for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += obj;
      }
      const xrefOffset = Buffer.byteLength(pdf);
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (const off of offsets) {
        pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
      }
      pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      const multiPagePdf = Buffer.from(pdf, 'latin1');

      try {
        const importService = new DnbImportService(
          realOcr,
          exchangeRateService,
          mockPartnerModel,
        );
        const result = await importService.extractFullReport(
          {
            originalname: 'multi-page-dnb.pdf',
            mimetype: 'application/pdf',
            size: multiPagePdf.length,
            buffer: multiPagePdf,
          } as Express.Multer.File,
          { companyId: 1 },
        );

        expect(result.success).toBe(true);
        expect(result.pageCount).toBe(2);
        expect(result.report.companyInfo.companyName.value).toBe('AGRICOM POLSKA SP. Z O.O.');
        expect(result.report.companyInfo.dunsNumber.value).toBe('31-528-9042');
        expect(result.report.address.country.value).toBe('Poland');
        expect(result.report.financial.annualSalesOriginal.value).toBe(28132730.84);
        expect(result.report.financial.originalCurrency.value).toBe('EUR');
        expect(result.report.financial.annualSalesInr.value).toBe(2672609429.8);
        expect(result.report.employees.employeeCount.value).toBe(39);
        expect(result.report.risk.paydex.value).toBe(81);
        expect(result.duplicateMatch.found).toBe(true);
        expect(result.duplicateMatch.matchType).toBe('DUNS');
        expect(result.duplicateMatch.partner?.id).toBe(42);
      } finally {
        await realOcr.onModuleDestroy();
      }
    });

    it('strictly rejects portal chrome (/REGIONAL INSIGHT, Portfolio, ratio paragraphs), splits European address, and keeps full legal company name', () => {
      const boxes = [
        { text: 'D&B Hoovers', x0: 20, y0: 10, x1: 120, y1: 24, page: 1 },
        { text: 'Get Report', x0: 500, y0: 10, x1: 590, y1: 24, page: 1 },
        { text: 'ELPOL ŁUŹNIAK SPÓŁKA KOMANDYTOWA', x0: 20, y0: 38, x1: 380, y1: 62, page: 1 },
        { text: 'Active', x0: 410, y0: 42, x1: 460, y1: 58, page: 1 },
        { text: 'Single Location', x0: 470, y0: 42, x1: 570, y1: 58, page: 1 },
        { text: 'Overview', x0: 20, y0: 76, x1: 90, y1: 92, page: 1 },
        { text: 'Country/Regional Insight', x0: 110, y0: 76, x1: 270, y1: 92, page: 1 },
        { text: 'Portfolio', x0: 290, y0: 76, x1: 360, y1: 92, page: 1 },
        { text: 'Osina Mała 14', x0: 20, y0: 115, x1: 180, y1: 132, page: 1 },
        { text: '98-358', x0: 20, y0: 136, x1: 90, y1: 152, page: 1 },
        { text: 'Kiełczygłów', x0: 20, y0: 156, x1: 130, y1: 172, page: 1 },
        { text: 'Poland', x0: 20, y0: 176, x1: 90, y1: 192, page: 1 },
        { text: 'Industry Norms', x0: 20, y0: 215, x1: 140, y1: 232, page: 1 },
        { text: 'specific ratios are calculated on the basis of peer statements...', x0: 20, y0: 236, x1: 420, y1: 252, page: 1 },
        { text: 'Primary Industry: Wholesale Agricultural Raw Materials', x0: 20, y0: 268, x1: 360, y1: 284, page: 1 },
        { text: 'Annual Sales', x0: 20, y0: 310, x1: 140, y1: 326, page: 1 },
        { text: '28,132,730.84', x0: 20, y0: 332, x1: 150, y1: 350, page: 1 },
        { text: '(EUR)', x0: 20, y0: 354, x1: 70, y1: 370, page: 1 },
        { text: 'Employees', x0: 260, y0: 310, x1: 340, y1: 326, page: 1 },
        { text: '39', x0: 260, y0: 332, x1: 290, y1: 350, page: 1 },
      ];
      const fullText = boxes.map((b) => b.text).join('\n');
      const parsed = parseFullDnbReport(fullText, boxes, 'OCR_SPATIAL');

      expect(parsed.companyInfo.companyName.value).toBe('ELPOL ŁUŹNIAK SPÓŁKA KOMANDYTOWA');
      expect(parsed.companyInfo.companyName.confidence).toBeGreaterThanOrEqual(80);
      expect(parsed.companyInfo.companyName.needsReview).toBe(false);

      expect(parsed.address.street.value).toBe('Osina Mała 14');
      expect(parsed.address.postalCode.value).toBe('98-358');
      expect(parsed.address.city.value).toBe('Kiełczygłów');
      expect(parsed.address.country.value).toBe('Poland');
      expect(parsed.address.country.confidence).toBeGreaterThanOrEqual(80);
      expect(parsed.address.city.confidence).toBeGreaterThanOrEqual(80);

      expect(parsed.business.industry.value).toBe('Wholesale Agricultural Raw Materials');
      expect(parsed.financial.annualSalesOriginal.value).toBe(28132730.84);
      expect(parsed.financial.originalCurrency.value).toBe('EUR');
      expect(parsed.employees.employeeCount.value).toBe(39);

      // Isolated portal chrome text must produce null for Country/City/Industry and flag truncated name < 80%
      const pollutedText = [
        'Company Name: ELPOL ŁUŹNIAK SPÓŁKA KOMAN',
        'Country/Regional Insight',
        'City: Portfolio',
        'Industry',
        'specific ratios are calculated on the basis of peer data...',
      ].join('\n');
      const cleaned = parseFullDnbReport(pollutedText, [], 'OCR_TEXT');
      expect(cleaned.address.country.value).toBeNull();
      expect(cleaned.address.city.value).toBeNull();
      expect(cleaned.business.industry.value).toBeNull();
      expect(cleaned.companyInfo.companyName.confidence).toBeLessThan(80);
      expect(cleaned.companyInfo.companyName.needsReview).toBe(true);
    });

    it('runs hybrid OCR -> LLM JSON validation layer when AI key is configured and validates outputs semantically', async () => {
      const configService = {
        get: jest.fn((key: string) =>
          key === 'OPENAI_API_KEY' ? 'test-openai-key' : undefined,
        ),
      } as unknown as ConfigService;

      const { of } = await import('rxjs');
      const postSpy = jest.fn().mockReturnValue(
        of({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    companyName: 'ELPOL ŁUŹNIAK SPÓŁKA KOMANDYTOWA Get Report',
                    dunsNumber: '42-123-4567',
                    street: 'Osina Mała 14',
                    postalCode: '98-358',
                    city: 'Kiełczygłów',
                    country: 'Poland',
                    industry: 'Wholesale Agricultural Raw Materials',
                    annualSales: 28132730.84,
                    currency: 'EUR',
                    employeeCount: 39,
                  }),
                },
              },
            ],
          },
        }),
      );

      const mockHttp = { post: postSpy } as unknown as HttpService;
      const hybridOcr = new DnbOcrService(configService, mockHttp);
      const hint = await hybridOcr.extractStructuredFieldsWithLlm(
        'ELPOL ŁUŹNIAK SPÓŁKA KOMAN\nOsina Mała 14\n98-358 Kiełczygłów\nPoland',
      );
      expect(hint).not.toBeNull();
      expect(postSpy).toHaveBeenCalledTimes(1);

      const importService = new DnbImportService(
        hybridOcr,
        exchangeRateService,
      );
      const degradedReport = parseFullDnbReport(
        'Company Name: ELPOL ŁUŹNIAK SPÓŁKA KOMAN\nCountry/Regional Insight',
        [],
        'OCR_TEXT',
      );
      expect(degradedReport.companyInfo.companyName.needsReview).toBe(true);
      expect(degradedReport.address.country.value).toBeNull();

      // Upgrade degraded low-confidence report via mergeAiVisionFields with strict validation
      (importService as any).mergeAiVisionFields(degradedReport, {
        ...hint!.visionFields,
        // Even if LLM hallucinated "Portfolio" for another test or "Get Report" badge, validator cleans/rejects
        companyName: 'ELPOL ŁUŹNIAK SPÓŁKA KOMANDYTOWA Get Report',
      });

      expect(degradedReport.companyInfo.companyName.value).toBe('ELPOL ŁUŹNIAK SPÓŁKA KOMANDYTOWA');
      expect(degradedReport.companyInfo.companyName.confidence).toBeGreaterThanOrEqual(80);
      expect(degradedReport.companyInfo.companyName.needsReview).toBe(false);
      expect(degradedReport.address.country.value).toBe('Poland');
      expect(degradedReport.address.city.value).toBe('Kiełczygłów');
      expect(degradedReport.address.postalCode.value).toBe('98-358');
      expect(degradedReport.business.industry.value).toBe('Wholesale Agricultural Raw Materials');
      await hybridOcr.onModuleDestroy();
    });
  });
});
