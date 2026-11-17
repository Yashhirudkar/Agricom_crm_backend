import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface CompanySignatures {
  signatureUrl?: string | null;
  stampUrl?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
}

/**
 * Interface contract for Signature provider.
 * When the Company Signature Master is integrated later, it will implement
 * this exact contract (or replace this service) to load default company
 * signatures and seals without requiring changes in the Export Invoices module.
 */
export interface ISignatureProvider {
  getSignaturesForCompany(companyId?: number | null): Promise<CompanySignatures>;
  saveUploadedFile(
    file: Express.Multer.File,
    type: 'signature' | 'stamp',
  ): Promise<string>;
}

@Injectable()
export class SignatureProviderService implements ISignatureProvider {
  private readonly logger = new Logger(SignatureProviderService.name);
  private readonly uploadsDir = path.resolve(process.cwd(), 'uploads', 'signatures');

  constructor() {
    this.ensureDirectoryExists(this.uploadsDir);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async getSignaturesForCompany(companyId?: number | null): Promise<CompanySignatures> {
    // In this temporary stage, return default or empty values.
    // Later, when Company Signature Master is ready, it will fetch from company_signatures table.
    return {
      signatureUrl: null,
      stampUrl: null,
      signatoryName: 'Authorized Signatory',
      signatoryDesignation: 'Director / Authorized Representative',
    };
  }

  async saveUploadedFile(
    file: Express.Multer.File,
    type: 'signature' | 'stamp',
  ): Promise<string> {
    const ext = path.extname(file.originalname || '') || '.png';
    const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destinationPath = path.join(this.uploadsDir, filename);

    if (file.buffer) {
      await fs.promises.writeFile(destinationPath, file.buffer);
    } else if (file.path) {
      await fs.promises.copyFile(file.path, destinationPath);
    }

    // Return the public/static URL route
    return `/uploads/signatures/${filename}`;
  }
}

