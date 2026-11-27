export type ExtractionSource =
  | 'OCR_SPATIAL'
  | 'OCR_TEXT'
  | 'PDF_TEXT'
  | 'AI_VISION'
  | 'DERIVED';

export interface ExtractedField<T = string | number> {
  value: T | null;
  confidence: number; // 0-100
  source: ExtractionSource;
  rawText?: string | null;
  needsReview: boolean;
}

export interface DnbCompanyInfoExtracted {
  companyName: ExtractedField<string>;
  tradeName: ExtractedField<string>;
  dunsNumber: ExtractedField<string>;
  registrationNumber: ExtractedField<string>;
  vatNumber: ExtractedField<string>;
  legalForm: ExtractedField<string>;
  ownership: ExtractedField<string>;
  companyStatus: ExtractedField<string>;
  headquarters: ExtractedField<string>;
  branchIndicator: ExtractedField<string>;
}

export interface DnbAddressExtracted {
  fullAddress: ExtractedField<string>;
  street: ExtractedField<string>;
  area: ExtractedField<string>;
  city: ExtractedField<string>;
  stateProvince: ExtractedField<string>;
  country: ExtractedField<string>;
  postalCode: ExtractedField<string>;
}

export interface DnbContactExtracted {
  phone: ExtractedField<string>;
  mobile: ExtractedField<string>;
  email: ExtractedField<string>;
  website: ExtractedField<string>;
  fax: ExtractedField<string>;
}

export interface DnbBusinessExtracted {
  lineOfBusiness: ExtractedField<string>;
  industry: ExtractedField<string>;
  businessDescription: ExtractedField<string>;
  sicCode: ExtractedField<string>;
  naicsCode: ExtractedField<string>;
}

export interface DnbFinancialExtracted {
  annualSalesOriginal: ExtractedField<number>;
  originalCurrency: ExtractedField<string>;
  annualSalesInr: ExtractedField<number>;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  isFallbackRate: boolean;
  latestFinancialDate: ExtractedField<string>;
  detectedValueDisplay: string | null;
}

export interface DnbEmployeesExtracted {
  employeeCount: ExtractedField<number>;
}

export interface DnbCompanyAgeExtracted {
  yearEstablished: ExtractedField<number>;
  incorporationDate: ExtractedField<string>;
}

export interface DnbRiskExtracted {
  dnbRating: ExtractedField<string>;
  failureScore: ExtractedField<number>;
  paydex: ExtractedField<number>;
  delinquencyScore: ExtractedField<number>;
  financialStressScore: ExtractedField<number>;
  creditLimitOriginal: ExtractedField<number>;
  creditLimitCurrency: ExtractedField<string>;
  creditLimitInr: ExtractedField<number>;
  riskClass: ExtractedField<'LOW' | 'MODERATE' | 'HIGH'>;
  riskRecommendation: ExtractedField<string>;
}

export interface DnbParentExtracted {
  parentCompany: ExtractedField<string>;
  globalParent: ExtractedField<string>;
  ultimateParent: ExtractedField<string>;
}

export interface DnbDirectorEntry {
  name: string;
  role: string | null;
  confidence: number;
}

export interface DnbAdditionalExtracted {
  importExportStatus: ExtractedField<string>;
  ownershipType: ExtractedField<string>;
  publicPrivate: ExtractedField<string>;
  numberOfBranches: ExtractedField<number>;
  legalEvents: ExtractedField<string>;
  bankruptcyStatus: ExtractedField<string>;
  businessActivity: ExtractedField<string>;
}

export interface ParsedDnbReport {
  companyInfo: DnbCompanyInfoExtracted;
  address: DnbAddressExtracted;
  contact: DnbContactExtracted;
  business: DnbBusinessExtracted;
  financial: DnbFinancialExtracted;
  employees: DnbEmployeesExtracted;
  companyAge: DnbCompanyAgeExtracted;
  risk: DnbRiskExtracted;
  parent: DnbParentExtracted;
  directors: DnbDirectorEntry[];
  additional: DnbAdditionalExtracted;
  /** Raw sales label & snippet for currency fallback resolution */
  salesMeta: {
    found: boolean;
    currencyHint: string | null;
    labelMatched: string | null;
    rawMatchedText: string | null;
  };
  creditLimitMeta: {
    currencyHint: string | null;
    rawMatchedText: string | null;
  };
}

export interface DnbDuplicatePartnerMatch {
  found: boolean;
  matchType: 'DUNS' | 'VAT_TAX_ID' | 'COMPANY_NAME' | null;
  matchedValue: string | null;
  partner: {
    id: number;
    entityName: string;
    country: string;
    city: string | null;
    taxId: string | null;
    annualTurnover: number | null;
    yearOfEstablishment: number | null;
    partnerRoleId: number;
  } | null;
}

export interface DnbFullReportExtractionResponse {
  success: boolean;
  status: 'SUCCESS' | 'PARTIAL' | 'NOT_DETECTED';
  ocrEngine: string;
  pageCount: number;
  extractedCount: number;
  message: string;
  warnings: string[];
  report: ParsedDnbReport;
  duplicateMatch: DnbDuplicatePartnerMatch;
}
