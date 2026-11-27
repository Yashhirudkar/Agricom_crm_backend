import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';
import { createWorker, Worker } from 'tesseract.js';
import { OcrBoxLine } from './annual-sales-parser.util';

// @tesseract.js-data/eng ships CommonJS metadata without .d.ts typings
// eslint-disable-next-line @typescript-eslint/no-require-imports
const engTrainedData = require('@tesseract.js-data/eng') as {
  langPath: string;
};

export interface StructuredVisionHint {
  amount?: number | null;
  currency?: string | null;
  labelMatched?: string | null;
  rawMatchedText?: string | null;
  visionFields?: Record<string, any> | null;
}

export interface DocumentExtractionResult {
  text: string;
  lines: OcrBoxLine[];
  pageCount: number;
  engine: 'ai-vision-gemini' | 'ai-vision-openai' | 'tesseract-ocr' | 'pdf-text' | 'pdf-ocr';
  structuredHint?: StructuredVisionHint | null;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_TEXT_PAGES = 50;
const MAX_PDF_OCR_PAGES = 25;

const DNB_LLM_EXTRACTION_PROMPT = [
  'Read this Dun & Bradstreet (D&B) report document carefully across all pages and cards.',
  'Strict semantic mapping rules:',
  '1. "companyName": extract the COMPLETE legal company name (usually at the top page header or Company Name card). NEVER truncate; ignore UI chips/buttons like "Get Report", "Active", "Headquarters", "Single Location".',
  '2. Address splitting: separate full address into "street", "postalCode", "city", "stateProvince", "country", and "fullAddress". "country" must be an actual sovereign country (NEVER portal headings like "/REGIONAL INSIGHT", "Regional Insight", "Portfolio", "Map", or "Overview"). "city" must come strictly from the address (NEVER "Portfolio" or navigation tabs).',
  '3. "industry" / "lineOfBusiness": extract concise classification names from "Line of Business", "Industry", "Business Activity", "SIC", or "NAICS". NEVER copy explanatory paragraphs or ratio footnotes such as "specific ratios are calculated on...".',
  '4. "annualSales" & "currency": extract strictly from the Annual Sales / Turnover / Revenue section, never from Employees, DUNS, years, or postal codes.',
  'Return ONLY valid JSON (no markdown fences) with exact keys:',
  '{"companyName": string|null, "tradeName": string|null, "dunsNumber": string|null, "registrationNumber": string|null, "vatNumber": string|null, "legalForm": string|null, "ownership": string|null, "companyStatus": string|null, "headquarters": string|null, "branchIndicator": string|null, "street": string|null, "area": string|null, "city": string|null, "stateProvince": string|null, "country": string|null, "postalCode": string|null, "fullAddress": string|null, "phone": string|null, "mobile": string|null, "email": string|null, "website": string|null, "fax": string|null, "lineOfBusiness": string|null, "industry": string|null, "businessDescription": string|null, "sicCode": string|null, "naicsCode": string|null, "annualSales": number|null, "currency": string|null, "latestFinancialDate": string|null, "employeeCount": number|null, "yearEstablished": number|null, "incorporationDate": string|null, "dnbRating": string|null, "failureScore": number|null, "paydex": number|null, "delinquencyScore": number|null, "financialStressScore": number|null, "creditLimit": number|null, "creditLimitCurrency": string|null, "riskClass": string|null, "riskRecommendation": string|null, "parentCompany": string|null, "globalParent": string|null, "ultimateParent": string|null, "directors": Array<{name: string, role: string|null}>, "importExportStatus": string|null, "ownershipType": string|null, "publicPrivate": string|null, "numberOfBranches": number|null, "legalEvents": string|null, "bankruptcyStatus": string|null, "businessActivity": string|null, "labelMatched": string|null, "rawMatchedText": string|null, "visibleText": string}.',
].join('\n');

@Injectable()
export class DnbOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(DnbOcrService.name);
  private workerPromise: Promise<Worker> | null = null;
  private ocrQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.workerPromise) {
      try {
        const worker = await this.workerPromise;
        await worker.terminate();
      } catch {
        // ignore termination errors on shutdown
      } finally {
        this.workerPromise = null;
      }
    }
  }

  validateFile(file?: Express.Multer.File): void {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(
        'Please upload or paste a valid PNG, JPG, JPEG, WEBP, or PDF file.',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        'File size exceeds maximum allowed limit of 10MB.',
      );
    }

    const originalName = (file.originalname || '').toLowerCase();
    const dotIndex = originalName.lastIndexOf('.');
    const ext = dotIndex >= 0 ? originalName.slice(dotIndex) : '';
    const mime = (file.mimetype || '').toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        'Unsupported file format. Allowed formats: PNG, JPG, JPEG, WEBP, PDF.',
      );
    }
  }

  private detectFileKind(file: Express.Multer.File): 'pdf' | 'image' {
    const buf = file.buffer;
    if (buf.length >= 4 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'pdf';
    }
    if (
      (file.mimetype || '').toLowerCase() === 'application/pdf' ||
      (file.originalname || '').toLowerCase().endsWith('.pdf')
    ) {
      // Check PDF magic bytes if declared as PDF
      const header = buf.subarray(0, 1024).toString('latin1');
      if (header.includes('%PDF-')) {
        return 'pdf';
      }
      throw new BadRequestException(
        'The uploaded PDF file appears to be invalid or corrupted.',
      );
    }

    // Verify common raster signatures (PNG, JPEG, WEBP)
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47;
    const isJpeg =
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isWebp =
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isPng && !isJpeg && !isWebp) {
      throw new BadRequestException(
        'The uploaded image file appears to be corrupted or in an unsupported format.',
      );
    }

    return 'image';
  }

  async extractDocumentContent(
    file: Express.Multer.File,
  ): Promise<DocumentExtractionResult> {
    this.validateFile(file);
    const kind = this.detectFileKind(file);

    // Optional Tier 1: Direct AI Vision extraction when API key is configured
    const visionResult = await this.tryAiVisionExtraction(file, kind);
    if (visionResult && (visionResult.text || visionResult.structuredHint?.amount)) {
      return visionResult;
    }

    const localResult =
      kind === 'pdf'
        ? await this.extractFromPdf(file.buffer)
        : await this.extractFromImage(file.buffer);

    // Hybrid Tier 2: Run LLM JSON validation/structuring over extracted OCR/PDF text when configured
    if (!localResult.structuredHint?.visionFields && localResult.text?.trim()) {
      const llmHint = await this.extractStructuredFieldsWithLlm(
        localResult.text,
        localResult.lines,
      );
      if (llmHint) {
        return {
          ...localResult,
          structuredHint: llmHint,
        };
      }
    }

    return localResult;
  }

  private getAiProviderKeys(): { geminiKey: string; openAiKey: string } {
    const geminiKey = (
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_AI_API_KEY') ||
      ''
    ).trim();
    const openAiKey = (
      this.configService.get<string>('OPENAI_API_KEY') || ''
    ).trim();
    return { geminiKey, openAiKey };
  }

  /**
   * Hybrid OCR -> LLM validation layer: converts raw extracted text + spatial layout
   * into validated structured JSON using Gemini or OpenAI when configured.
   */
  async extractStructuredFieldsWithLlm(
    rawText: string,
    lines: OcrBoxLine[] = [],
  ): Promise<StructuredVisionHint | null> {
    const { geminiKey, openAiKey } = this.getAiProviderKeys();
    if (!geminiKey && !openAiKey) return null;

    const spatialPreview =
      lines && lines.length > 0
        ? lines
            .slice(0, 240)
            .map((l) => `[p${l.page ?? 1} x:${Math.round(l.x0)} y:${Math.round(l.y0)}] ${l.text}`)
            .join('\n')
        : rawText;
    const boundedInput = spatialPreview.slice(0, 18000);
    const combinedPrompt = `${DNB_LLM_EXTRACTION_PROMPT}\n\n--- OCR / PDF TEXT & LAYOUT ---\n${boundedInput}`;

    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const { data } = await firstValueFrom(
          this.httpService.post(
            url,
            {
              contents: [{ parts: [{ text: combinedPrompt }] }],
              generationConfig: { temperature: 0 },
            },
            { timeout: 15000 },
          ),
        );
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = this.parseVisionJsonResponse(content);
        if (parsed) {
          return {
            amount: parsed.annualSales,
            currency: parsed.currency,
            labelMatched: parsed.labelMatched,
            rawMatchedText: parsed.rawMatchedText,
            visionFields: parsed.rawObj,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Hybrid Gemini LLM validation skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (openAiKey) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-4o-mini',
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [{ role: 'user', content: combinedPrompt }],
            },
            {
              headers: { Authorization: `Bearer ${openAiKey}` },
              timeout: 15000,
            },
          ),
        );
        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = this.parseVisionJsonResponse(content);
        if (parsed) {
          return {
            amount: parsed.annualSales,
            currency: parsed.currency,
            labelMatched: parsed.labelMatched,
            rawMatchedText: parsed.rawMatchedText,
            visionFields: parsed.rawObj,
          };
        }
      } catch (error) {
        this.logger.warn(
          `Hybrid OpenAI LLM validation skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return null;
  }

  private async tryAiVisionExtraction(
    file: Express.Multer.File,
    kind: 'pdf' | 'image',
  ): Promise<DocumentExtractionResult | null> {
    const { geminiKey, openAiKey } = this.getAiProviderKeys();

    if (geminiKey) {
      try {
        const mimeType =
          kind === 'pdf'
            ? 'application/pdf'
            : file.mimetype && file.mimetype.startsWith('image/')
              ? file.mimetype
              : 'image/png';

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const { data } = await firstValueFrom(
          this.httpService.post(
            url,
            {
              contents: [
                {
                  parts: [
                    { text: DNB_LLM_EXTRACTION_PROMPT },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: file.buffer.toString('base64'),
                      },
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0 },
            },
            { timeout: 20000 },
          ),
        );

        const rawText =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = this.parseVisionJsonResponse(rawText);
        if (parsed) {
          return {
            text: parsed.visibleText || parsed.rawMatchedText || '',
            lines: [],
            pageCount: 1,
            engine: 'ai-vision-gemini',
            structuredHint: {
              amount: parsed.annualSales,
              currency: parsed.currency,
              labelMatched: parsed.labelMatched,
              rawMatchedText: parsed.rawMatchedText,
              visionFields: parsed.rawObj,
            },
          };
        }
      } catch (error) {
        this.logger.warn(
          `Gemini Vision extraction unavailable, falling back to local OCR: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (openAiKey && kind === 'image') {
      try {
        const pngBuffer = await sharp(file.buffer).png().toBuffer();
        const base64 = pngBuffer.toString('base64');
        const { data } = await firstValueFrom(
          this.httpService.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-4o-mini',
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: DNB_LLM_EXTRACTION_PROMPT,
                    },
                    {
                      type: 'image_url',
                      image_url: { url: `data:image/png;base64,${base64}` },
                    },
                  ],
                },
              ],
            },
            {
              headers: { Authorization: `Bearer ${openAiKey}` },
              timeout: 20000,
            },
          ),
        );

        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = this.parseVisionJsonResponse(content);
        if (parsed) {
          return {
            text: parsed.visibleText || parsed.rawMatchedText || '',
            lines: [],
            pageCount: 1,
            engine: 'ai-vision-openai',
            structuredHint: {
              amount: parsed.annualSales,
              currency: parsed.currency,
              labelMatched: parsed.labelMatched,
              rawMatchedText: parsed.rawMatchedText,
              visionFields: parsed.rawObj,
            },
          };
        }
      } catch (error) {
        this.logger.warn(
          `OpenAI Vision extraction unavailable, falling back to local OCR: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return null;
  }

  private parseVisionJsonResponse(raw: string): {
    annualSales: number | null;
    currency: string | null;
    labelMatched: string | null;
    rawMatchedText: string | null;
    visibleText: string;
    rawObj: Record<string, any>;
  } | null {
    if (!raw) return null;
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    try {
      const obj = JSON.parse(cleaned);
      if (!obj || typeof obj !== 'object') return null;
      const num =
        obj.annualSales !== null && obj.annualSales !== undefined
          ? Number(obj.annualSales)
          : null;
      return {
        annualSales: num !== null && Number.isFinite(num) && num >= 0 ? num : null,
        currency:
          typeof obj.currency === 'string' && obj.currency.trim()
            ? obj.currency.trim().toUpperCase()
            : null,
        labelMatched:
          typeof obj.labelMatched === 'string' ? obj.labelMatched : null,
        rawMatchedText:
          typeof obj.rawMatchedText === 'string' ? obj.rawMatchedText : null,
        visibleText:
          typeof obj.visibleText === 'string' ? obj.visibleText : '',
        rawObj: obj,
      };
    } catch {
      return null;
    }
  }

  private async extractFromImage(
    buffer: Buffer,
  ): Promise<DocumentExtractionResult> {
    let preprocessed: Buffer;
    try {
      const image = sharp(buffer, { failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Missing image dimensions');
      }

      const targetWidth =
        metadata.width < 1400
          ? Math.min(metadata.width * 2, 2400)
          : Math.min(metadata.width, 3200);

      preprocessed = await image
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: targetWidth, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
    } catch (error) {
      throw new BadRequestException(
        'Could not decode the uploaded image. Please ensure the file is not corrupted.',
      );
    }

    const ocrResult = await this.runTesseractOcr(preprocessed, 1);
    return {
      text: ocrResult.text,
      lines: ocrResult.lines,
      pageCount: 1,
      engine: 'tesseract-ocr',
    };
  }

  private loadPdfJs(): any {
    // pdfjs-dist v3 legacy build is native CommonJS (works across Node 18-24 and Jest)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('pdfjs-dist/legacy/build/pdf.js');
  }

  private async extractFromPdf(
    buffer: Buffer,
  ): Promise<DocumentExtractionResult> {
    let pdfjsLib: any;
    try {
      pdfjsLib = this.loadPdfJs();
    } catch (error) {
      this.logger.error('Failed to load pdfjs-dist', error);
      throw new BadRequestException('PDF parser is unavailable.');
    }

    let doc: any;
    try {
      doc = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        verbosity: 0,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
      }).promise;
    } catch {
      throw new BadRequestException(
        'Unable to open the PDF document. It may be corrupted or password-protected.',
      );
    }

    try {
      const totalPages = Math.min(doc.numPages || 0, MAX_PDF_TEXT_PAGES);
      const { OPS } = pdfjsLib;
      const pageTexts: string[] = [];
      const allLines: OcrBoxLine[] = [];
      let usedOcr = false;
      let usedText = false;

      // Read every page cleanly: use native PDF text where present, and seamlessly OCR
      // embedded page images on scanned/mixed pages so multi-page reports merge completely.
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const items = (textContent?.items || []).filter(
          (item: any) => item && typeof item.str === 'string' && item.str.trim(),
        );

        const pageLines = this.buildPdfSpatialLines(
          items,
          viewport.height,
          pageNum,
        );
        const pageText = pageLines.map((l) => l.text).join('\n').trim();
        const pageAlphaNum = pageText.replace(/[^A-Za-z0-9]/g, '').length;

        if (pageAlphaNum >= 12) {
          usedText = true;
          allLines.push(...pageLines);
          pageTexts.push(pageText);
          continue;
        }

        if (pageNum > MAX_PDF_OCR_PAGES) {
          continue;
        }

        const ops = await page.getOperatorList();
        const seenImages = new Set<string>();

        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i];
          if (
            fn !== OPS.paintImageXObject &&
            fn !== OPS.paintInlineImageXObject
          ) {
            continue;
          }

          const arg = ops.argsArray[i]?.[0];
          let imgObj: any = null;

          if (fn === OPS.paintImageXObject && typeof arg === 'string') {
            if (seenImages.has(arg)) continue;
            seenImages.add(arg);
            imgObj = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(null), 2000);
              page.objs.get(arg, (obj: any) => {
                clearTimeout(timer);
                resolve(obj);
              });
            });
          } else if (fn === OPS.paintInlineImageXObject && arg?.data) {
            imgObj = arg;
          }

          if (
            !imgObj ||
            !imgObj.data ||
            !imgObj.width ||
            !imgObj.height ||
            imgObj.width < 120 ||
            imgObj.height < 60
          ) {
            continue;
          }

          const channels =
            imgObj.kind === 1 ? 1 : imgObj.kind === 3 ? 4 : 3;
          const expectedSize = imgObj.width * imgObj.height * channels;
          if (imgObj.data.length < expectedSize) continue;

          try {
            const targetWidth =
              imgObj.width < 1400
                ? Math.min(imgObj.width * 2, 2400)
                : Math.min(imgObj.width, 3200);
            const pngBuffer = await sharp(
              Buffer.from(imgObj.data.subarray(0, expectedSize)),
              {
                raw: {
                  width: imgObj.width,
                  height: imgObj.height,
                  channels,
                },
              },
            )
              .resize({ width: targetWidth, withoutEnlargement: false })
              .grayscale()
              .normalize()
              .png()
              .toBuffer();

            const ocr = await this.runTesseractOcr(pngBuffer, pageNum);
            if (ocr.text.trim()) {
              usedOcr = true;
              pageTexts.push(ocr.text.trim());
              allLines.push(...ocr.lines);
            }
          } catch {
            // Skip malformed embedded image and continue scanning remaining images
          }
        }
      }

      return {
        text: pageTexts.join('\n').trim(),
        lines: allLines,
        pageCount: doc.numPages || totalPages || 1,
        engine: usedOcr && !usedText ? 'pdf-ocr' : 'pdf-text',
      };
    } finally {
      try {
        await doc.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private buildPdfSpatialLines(
    items: any[],
    pageHeight: number,
    pageNum: number,
  ): OcrBoxLine[] {
    interface PdfToken {
      text: string;
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      height: number;
    }

    const tokens: PdfToken[] = items.map((item) => {
      const tx = item.transform || [1, 0, 0, 1, 0, 0];
      const x0 = Number(tx[4]) || 0;
      const height = Math.max(8, Math.abs(Number(item.height) || Number(tx[3]) || 10));
      const yBottom = pageHeight - (Number(tx[5]) || 0);
      const y0 = yBottom - height;
      const width = Math.max(4, Number(item.width) || item.str.length * 4);
      return {
        text: item.str,
        x0,
        x1: x0 + width,
        y0,
        y1: yBottom,
        height,
      };
    });

    tokens.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const rows: PdfToken[][] = [];
    for (const token of tokens) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow) {
        rows.push([token]);
        continue;
      }
      const refY = lastRow[0].y0;
      const tolerance = Math.max(4, lastRow[0].height * 0.45);
      if (Math.abs(token.y0 - refY) <= tolerance) {
        lastRow.push(token);
      } else {
        rows.push([token]);
      }
    }

    return rows.flatMap((row) => {
      row.sort((a, b) => a.x0 - b.x0);
      const segments: PdfToken[][] = [];
      let current: PdfToken[] = [];

      for (let i = 0; i < row.length; i++) {
        const curr = row[i];
        if (current.length === 0) {
          current.push(curr);
          continue;
        }
        const prev = current[current.length - 1];
        const gap = curr.x0 - prev.x1;
        const splitThreshold = Math.max(18, prev.height * 1.5);
        if (gap > splitThreshold) {
          segments.push(current);
          current = [curr];
        } else {
          current.push(curr);
        }
      }
      if (current.length > 0) {
        segments.push(current);
      }

      return segments
        .map((seg) => {
          let segText = '';
          for (let i = 0; i < seg.length; i++) {
            const curr = seg[i];
            if (i === 0) {
              segText = curr.text;
            } else {
              const prev = seg[i - 1];
              const gap = curr.x0 - prev.x1;
              segText += gap > 1.5 ? ' ' : '';
              segText += curr.text;
            }
          }
          return {
            text: segText.trim(),
            x0: Math.min(...seg.map((r) => r.x0)),
            y0: Math.min(...seg.map((r) => r.y0)),
            x1: Math.max(...seg.map((r) => r.x1)),
            y1: Math.max(...seg.map((r) => r.y1)),
            page: pageNum,
          };
        })
        .filter((seg) => seg.text.length > 0);
    });
  }

  private buildOcrSpatialSegments(
    data: any,
    pageNum: number,
  ): OcrBoxLine[] {
    interface OcrWordToken {
      text: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      height: number;
    }

    const rawWords = Array.isArray(data?.words) ? data.words : [];
    const tokens: OcrWordToken[] = rawWords
      .filter((w: any) => w?.text && String(w.text).trim() && w?.bbox)
      .map((w: any) => {
        const x0 = Number(w.bbox.x0) || 0;
        const y0 = Number(w.bbox.y0) || 0;
        const x1 = Number(w.bbox.x1) || 0;
        const y1 = Number(w.bbox.y1) || 0;
        return {
          text: String(w.text).trim(),
          x0,
          y0,
          x1,
          y1,
          height: Math.max(10, y1 - y0),
        };
      });

    if (tokens.length === 0) {
      return Array.isArray(data?.lines)
        ? data.lines
            .filter((l: any) => l?.text && l.text.trim())
            .map((l: any) => ({
              text: String(l.text).trim(),
              x0: Number(l.bbox?.x0) || 0,
              y0: Number(l.bbox?.y0) || 0,
              x1: Number(l.bbox?.x1) || 0,
              y1: Number(l.bbox?.y1) || 0,
              page: pageNum,
            }))
        : [];
    }

    tokens.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    // Group words into horizontal rows based on vertical center alignment
    const rows: OcrWordToken[][] = [];
    for (const token of tokens) {
      const tokenMidY = (token.y0 + token.y1) / 2;
      let targetRow: OcrWordToken[] | null = null;
      for (let r = rows.length - 1; r >= 0; r--) {
        const row = rows[r];
        const rowMidY =
          row.reduce((sum, t) => sum + (t.y0 + t.y1) / 2, 0) / row.length;
        const rowHeight =
          row.reduce((sum, t) => sum + t.height, 0) / row.length;
        if (Math.abs(tokenMidY - rowMidY) <= Math.max(10, rowHeight * 0.7)) {
          targetRow = row;
          break;
        }
      }
      if (targetRow) {
        targetRow.push(token);
      } else {
        rows.push([token]);
      }
    }

    rows.sort(
      (a, b) =>
        Math.min(...a.map((t) => t.y0)) - Math.min(...b.map((t) => t.y0)),
    );

    const segments: OcrBoxLine[] = [];
    for (const row of rows) {
      row.sort((a, b) => a.x0 - b.x0);
      const rowHeight =
        row.reduce((sum, t) => sum + t.height, 0) / row.length;
      const splitGapThreshold = Math.max(22, rowHeight * 1.55);

      let currentSeg: OcrWordToken[] = [];
      for (const word of row) {
        if (currentSeg.length === 0) {
          currentSeg.push(word);
          continue;
        }
        const prev = currentSeg[currentSeg.length - 1];
        const gap = word.x0 - prev.x1;
        if (gap > splitGapThreshold) {
          segments.push({
            text: currentSeg.map((w) => w.text).join(' '),
            x0: Math.min(...currentSeg.map((w) => w.x0)),
            y0: Math.min(...currentSeg.map((w) => w.y0)),
            x1: Math.max(...currentSeg.map((w) => w.x1)),
            y1: Math.max(...currentSeg.map((w) => w.y1)),
            page: pageNum,
          });
          currentSeg = [word];
        } else {
          currentSeg.push(word);
        }
      }

      if (currentSeg.length > 0) {
        segments.push({
          text: currentSeg.map((w) => w.text).join(' '),
          x0: Math.min(...currentSeg.map((w) => w.x0)),
          y0: Math.min(...currentSeg.map((w) => w.y0)),
          x1: Math.max(...currentSeg.map((w) => w.x1)),
          y1: Math.max(...currentSeg.map((w) => w.y1)),
          page: pageNum,
        });
      }
    }

    return segments;
  }

  private async getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker('eng', 1, {
        langPath: engTrainedData.langPath,
        gzip: true,
        cacheMethod: 'none',
      }).catch((err) => {
        this.workerPromise = null;
        throw err;
      });
    }
    return this.workerPromise;
  }

  private runTesseractOcr(
    pngBuffer: Buffer,
    pageNum: number,
  ): Promise<{ text: string; lines: OcrBoxLine[] }> {
    const task = this.ocrQueue.then(async () => {
      const worker = await this.getWorker();
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('OCR processing timed out')),
            30000,
          ),
        );
        const result = await Promise.race([
          worker.recognize(pngBuffer),
          timeoutPromise,
        ]);
        const data: any = result?.data || {};
        const lines = this.buildOcrSpatialSegments(data, pageNum);

        return {
          text: String(data.text || ''),
          lines,
        };
      } catch (error) {
        // Reset worker on failure so subsequent OCR attempts stay healthy
        if (this.workerPromise) {
          try {
            const w = await this.workerPromise;
            await w.terminate();
          } catch {
            // ignore
          }
          this.workerPromise = null;
        }
        throw error;
      }
    });

    this.ocrQueue = task.catch(() => undefined);
    return task;
  }
}
