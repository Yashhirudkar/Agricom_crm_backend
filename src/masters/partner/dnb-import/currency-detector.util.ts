export interface CurrencyDetectionResult {
  currency: string | null;
  symbol: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'ADJACENT' | 'CONTEXT' | 'DOCUMENT_HEADER' | 'NONE';
}

export interface CurrencyMetadata {
  code: string;
  symbol: string;
  /** Words like ALL, TOP, TRY, PEN, CUP, BOB, MAD, SOS, NAD, GEL, RON can appear in normal English prose */
  ambiguousWord?: boolean;
}

const SUPPORTED_CURRENCIES: CurrencyMetadata[] = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'INR', symbol: '₹' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'CHF', symbol: 'CHF' },
  { code: 'AED', symbol: 'د.إ' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CNY', symbol: '¥' },
  { code: 'SAR', symbol: 'ر.س' },
  { code: 'QAR', symbol: 'ر.ق' },
  { code: 'SEK', symbol: 'kr' },
  { code: 'NOK', symbol: 'kr' },
  { code: 'DKK', symbol: 'kr' },
  { code: 'CZK', symbol: 'Kč' },
  { code: 'HUF', symbol: 'Ft' },
  { code: 'RON', symbol: 'lei', ambiguousWord: true },
  { code: 'BGN', symbol: 'лв' },
  { code: 'RSD', symbol: 'дин.' },
  { code: 'TRY', symbol: '₺', ambiguousWord: true },
  { code: 'ZAR', symbol: 'R' },
  { code: 'BRL', symbol: 'R$' },
  { code: 'MXN', symbol: 'MX$' },
  { code: 'KRW', symbol: '₩' },
  { code: 'THB', symbol: '฿' },
  { code: 'MYR', symbol: 'RM' },
  { code: 'IDR', symbol: 'Rp' },
  { code: 'PHP', symbol: '₱' },
  { code: 'VND', symbol: '₫' },
  { code: 'HKD', symbol: 'HK$' },
  { code: 'TWD', symbol: 'NT$' },
  { code: 'NZD', symbol: 'NZ$' },
  { code: 'RUB', symbol: '₽' },
  { code: 'UAH', symbol: '₴' },
  { code: 'KZT', symbol: '₸' },
  { code: 'PKR', symbol: '₨' },
  { code: 'BDT', symbol: '৳' },
  { code: 'LKR', symbol: '₨' },
  { code: 'EGP', symbol: 'E£' },
  { code: 'MAD', symbol: 'د.م.', ambiguousWord: true },
  { code: 'NGN', symbol: '₦' },
  { code: 'KES', symbol: 'KSh', ambiguousWord: true },
  { code: 'BHD', symbol: '.د.ب' },
  { code: 'OMR', symbol: 'ر.ع.' },
  { code: 'KWD', symbol: 'د.ك' },
  { code: 'JOD', symbol: 'د.ا' },
  { code: 'ILS', symbol: '₪' },
  { code: 'CLP', symbol: 'CLP$' },
  { code: 'COP', symbol: 'COL$' },
  { code: 'PEN', symbol: 'S/.', ambiguousWord: true },
  { code: 'ARS', symbol: 'AR$' },
  { code: 'TND', symbol: 'د.ت' },
  { code: 'DZD', symbol: 'دج' },
  { code: 'GHS', symbol: '₵' },
  { code: 'TZS', symbol: 'TSh' },
  { code: 'UGX', symbol: 'USh' },
  { code: 'ETB', symbol: 'Br' },
  { code: 'MUR', symbol: '₨' },
  { code: 'NPR', symbol: '₨' },
  { code: 'ISK', symbol: 'kr' },
  { code: 'BAM', symbol: 'KM', ambiguousWord: true },
  { code: 'MKD', symbol: 'ден' },
  { code: 'MDL', symbol: 'L' },
  { code: 'BYN', symbol: 'Br' },
  { code: 'AZN', symbol: '₼' },
  { code: 'AMD', symbol: '֏' },
  { code: 'GEL', symbol: '₾', ambiguousWord: true },
  { code: 'UZS', symbol: 'soʻm' },
  { code: 'KGS', symbol: 'с' },
  { code: 'TJS', symbol: 'ЅМ' },
  { code: 'TMT', symbol: 'm' },
  { code: 'ALL', symbol: 'L', ambiguousWord: true },
  { code: 'BOB', symbol: 'Bs.', ambiguousWord: true },
  { code: 'CUP', symbol: '$', ambiguousWord: true },
  { code: 'NAD', symbol: '$', ambiguousWord: true },
  { code: 'SOS', symbol: 'S', ambiguousWord: true },
  { code: 'TOP', symbol: 'T$', ambiguousWord: true },
  { code: 'XAF', symbol: 'FCFA' },
  { code: 'XOF', symbol: 'CFA' },
];

const CURRENCY_BY_CODE = new Map<string, CurrencyMetadata>(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c]),
);

const PREFIX_SYMBOL_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /(?:US\$|USD\$|\$US)/i, code: 'USD' },
  { pattern: /(?:CA\$|CAD\$|C\$)/i, code: 'CAD' },
  { pattern: /(?:AU\$|AUD\$|A\$)/i, code: 'AUD' },
  { pattern: /(?:SG\$|S\$)/i, code: 'SGD' },
  { pattern: /(?:HK\$)/i, code: 'HKD' },
  { pattern: /(?:NZ\$)/i, code: 'NZD' },
  { pattern: /(?:MX\$)/i, code: 'MXN' },
  { pattern: /(?:NT\$)/i, code: 'TWD' },
  { pattern: /(?:R\$)/i, code: 'BRL' },
  { pattern: /(?:CN¥)/i, code: 'CNY' },
  { pattern: /(?:JP¥)/i, code: 'JPY' },
  { pattern: /€/i, code: 'EUR' },
  { pattern: /£/i, code: 'GBP' },
  { pattern: /₹/i, code: 'INR' },
  { pattern: /zł/i, code: 'PLN' },
  { pattern: /Kč/i, code: 'CZK' },
  { pattern: /₺/i, code: 'TRY' },
  { pattern: /₽/i, code: 'RUB' },
  { pattern: /₴/i, code: 'UAH' },
  { pattern: /₩/i, code: 'KRW' },
  { pattern: /฿/i, code: 'THB' },
  { pattern: /₱/i, code: 'PHP' },
  { pattern: /₫/i, code: 'VND' },
  { pattern: /₪/i, code: 'ILS' },
  { pattern: /₦/i, code: 'NGN' },
  { pattern: /د\.إ/i, code: 'AED' },
  { pattern: /ر\.س/i, code: 'SAR' },
  { pattern: /ر\.ق/i, code: 'QAR' },
];

const CURRENCY_WORD_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(?:euros?|eur)\b/i, code: 'EUR' },
  { pattern: /\b(?:us\s+dollars?|u\.s\.\s+dollars?)\b/i, code: 'USD' },
  { pattern: /\b(?:pounds?\s+sterling|british\s+pounds?|gbp)\b/i, code: 'GBP' },
  { pattern: /\b(?:polish\s+z[łl]ot(?:y|ych)|z[łl]oty|z[łl]otych)\b/i, code: 'PLN' },
  { pattern: /\b(?:swiss\s+francs?|sfr)\b/i, code: 'CHF' },
  { pattern: /\b(?:uae\s+dirhams?|dirhams?|dhs)\b/i, code: 'AED' },
  { pattern: /\b(?:canadian\s+dollars?)\b/i, code: 'CAD' },
  { pattern: /\b(?:australian\s+dollars?)\b/i, code: 'AUD' },
  { pattern: /\b(?:singapore\s+dollars?)\b/i, code: 'SGD' },
  { pattern: /\b(?:indian\s+rupees?|rupees?|rs\.?)\b/i, code: 'INR' },
  { pattern: /\b(?:japanese\s+yen)\b/i, code: 'JPY' },
  { pattern: /\b(?:chinese\s+yuan|renminbi|rmb)\b/i, code: 'CNY' },
  { pattern: /\b(?:saudi\s+riyals?)\b/i, code: 'SAR' },
  { pattern: /\b(?:qatari\s+riyals?)\b/i, code: 'QAR' },
  { pattern: /\b(?:swedish\s+kron(?:a|or))\b/i, code: 'SEK' },
  { pattern: /\b(?:norwegian\s+kron(?:e|er))\b/i, code: 'NOK' },
  { pattern: /\b(?:danish\s+kron(?:e|er))\b/i, code: 'DKK' },
  { pattern: /\b(?:czech\s+korun(?:a|y))\b/i, code: 'CZK' },
  { pattern: /\b(?:hungarian\s+forints?)\b/i, code: 'HUF' },
  { pattern: /\b(?:turkish\s+lira)\b/i, code: 'TRY' },
  { pattern: /\b(?:south\s+african\s+rand)\b/i, code: 'ZAR' },
  { pattern: /\b(?:brazilian\s+real)\b/i, code: 'BRL' },
  { pattern: /\b(?:mexican\s+pesos?)\b/i, code: 'MXN' },
  { pattern: /\b(?:new\s+zealand\s+dollars?)\b/i, code: 'NZD' },
  { pattern: /\b(?:hong\s+kong\s+dollars?)\b/i, code: 'HKD' },
];

export function isSupportedCurrencyCode(code?: string | null): boolean {
  if (!code) return false;
  return CURRENCY_BY_CODE.has(code.trim().toUpperCase());
}

export function getCurrencySymbol(code?: string | null): string | null {
  if (!code) return null;
  return CURRENCY_BY_CODE.get(code.trim().toUpperCase())?.symbol || code.trim().toUpperCase();
}

/**
 * Extracts an ISO 4217 currency code from a short snippet of text
 * (such as an amount line or column header).
 */
export function detectCurrencyInSnippet(
  snippet: string,
  documentText = '',
  allowAmbiguous = true,
): string | null {
  if (!snippet || typeof snippet !== 'string') return null;

  // Normalize spaced uppercase currency letters from OCR artifacts like "E U R"
  const normalized = snippet.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\b/g, '$1$2$3');

  // 1. Explicit ISO 4217 3-letter codes (case-sensitive uppercase preferred, or explicit)
  const codeMatches = normalized.match(/\b[A-Z]{3}\b/g) || [];
  for (const token of codeMatches) {
    const meta = CURRENCY_BY_CODE.get(token);
    if (!meta) continue;
    if (meta.ambiguousWord && !allowAmbiguous) continue;
    return meta.code;
  }

  // Case-insensitive ISO check for unambiguous codes (e.g., "eur", "usd", "pln")
  const anyCaseTokens = normalized.match(/\b[A-Za-z]{3}\b/g) || [];
  for (const raw of anyCaseTokens) {
    const upper = raw.toUpperCase();
    const meta = CURRENCY_BY_CODE.get(upper);
    if (!meta || meta.ambiguousWord) continue;
    return meta.code;
  }

  // 2. Specific prefixed / distinct symbols
  for (const { pattern, code } of PREFIX_SYMBOL_PATTERNS) {
    if (pattern.test(normalized)) {
      return code;
    }
  }

  // 3. Currency words (euro, zloty, dirham, etc.)
  for (const { pattern, code } of CURRENCY_WORD_PATTERNS) {
    if (pattern.test(normalized)) {
      return code;
    }
  }

  // 4. Ambiguous single symbols like "$", "¥", "kr", "zł" (ascii "zl")
  if (/(?:^|[\s:(])zl\.?(?:$|[\s),0-9])/i.test(normalized)) {
    return 'PLN';
  }

  if (/\$/.test(normalized)) {
    const docCurrency = detectDocumentHeaderCurrency(documentText);
    if (docCurrency && ['USD', 'CAD', 'AUD', 'SGD', 'HKD', 'NZD', 'MXN', 'TWD', 'BRL', 'ARS', 'CLP', 'COP'].includes(docCurrency)) {
      return docCurrency;
    }
    return 'USD';
  }

  if (/¥/.test(normalized)) {
    if (/\b(?:CNY|RMB|CHINA|YUAN)\b/i.test(documentText)) return 'CNY';
    return 'JPY';
  }

  if (/\bkr\.?\b/i.test(normalized)) {
    if (/\b(?:SEK|SWEDEN|SWEDISH)\b/i.test(documentText)) return 'SEK';
    if (/\b(?:NOK|NORWAY|NORWEGIAN)\b/i.test(documentText)) return 'NOK';
    if (/\b(?:DKK|DENMARK|DANISH)\b/i.test(documentText)) return 'DKK';
  }

  return null;
}

/**
 * Checks document-level declarations such as:
 * "Currency: EUR", "All monetary amounts in USD", "Values in PLN", "Figures in ('000 EUR)"
 */
export function detectDocumentHeaderCurrency(documentText: string): string | null {
  if (!documentText || typeof documentText !== 'string') return null;

  const headerPatterns = [
    /(?:currency|monetary\s+unit|reporting\s+currency|local\s+currency|denominated\s+in)\s*[:=\-]?\s*([A-Z]{3}|\S+)/gi,
    /(?:all\s+(?:figures|amounts|values|numbers)\s+(?:are\s+)?in|amounts\s+in|figures\s+in|values\s+in|stated\s+in)\s+(?:thousands?\s+of\s+|millions?\s+of\s+)?([A-Za-z€£₹$¥]{1,20})/gi,
    /\(\s*(?:in\s+)?(?:['’]?000s?\s+|millions?\s+|thousands?\s+)?([A-Z]{3})\s*(?:['’]?000s?)?\s*\)/g,
  ];

  for (const regex of headerPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(documentText)) !== null) {
      const candidate = match[1];
      if (!candidate) continue;
      const detected = detectCurrencyInSnippet(candidate, documentText, false);
      if (detected) return detected;
    }
  }

  return null;
}

/**
 * Full currency resolution pipeline for an extracted Annual Sales match:
 * 1. Explicit hint / adjacent snippet around the matched amount
 * 2. Nearby context lines around the match
 * 3. Document-wide currency header declarations
 */
export function resolveAnnualSalesCurrency(options: {
  explicitHint?: string | null;
  matchedSnippet?: string | null;
  contextSnippet?: string | null;
  documentText?: string | null;
}): CurrencyDetectionResult {
  const docText = options.documentText || '';

  if (options.explicitHint) {
    const code = detectCurrencyInSnippet(options.explicitHint, docText, true);
    if (code) {
      return {
        currency: code,
        symbol: getCurrencySymbol(code),
        confidence: 'HIGH',
        source: 'ADJACENT',
      };
    }
  }

  if (options.matchedSnippet) {
    const code = detectCurrencyInSnippet(options.matchedSnippet, docText, true);
    if (code) {
      return {
        currency: code,
        symbol: getCurrencySymbol(code),
        confidence: 'HIGH',
        source: 'ADJACENT',
      };
    }
  }

  if (options.contextSnippet) {
    const code = detectCurrencyInSnippet(options.contextSnippet, docText, false);
    if (code) {
      return {
        currency: code,
        symbol: getCurrencySymbol(code),
        confidence: 'MEDIUM',
        source: 'CONTEXT',
      };
    }
  }

  if (docText) {
    const code = detectDocumentHeaderCurrency(docText);
    if (code) {
      return {
        currency: code,
        symbol: getCurrencySymbol(code),
        confidence: 'LOW',
        source: 'DOCUMENT_HEADER',
      };
    }
  }

  return {
    currency: null,
    symbol: null,
    confidence: 'LOW',
    source: 'NONE',
  };
}
