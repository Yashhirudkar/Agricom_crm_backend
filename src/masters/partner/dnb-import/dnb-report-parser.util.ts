import {
  OcrBoxLine,
  parseAnnualSalesFromText,
  parseLocalizedNumericValue,
} from './annual-sales-parser.util';
import {
  detectCurrencyInSnippet,
  resolveAnnualSalesCurrency,
} from './currency-detector.util';
import {
  DNB_CONFIDENCE_REVIEW_THRESHOLD,
  LEGAL_FORM_SUFFIX_REGEX,
  cleanCompanyNameCandidate,
  decomposeAddressText,
  detectAddressClusterFromLayout,
  isTruncatedCompanyName,
  isUiChromeOrNoise,
  isValidCityName,
  normalizeAndValidateCountry,
  sanitizeIndustryValue,
} from './dnb-field-validators.util';
import {
  DnbDirectorEntry,
  ExtractedField,
  ExtractionSource,
  ParsedDnbReport,
} from './dnb-import.types';

function emptyField<T>(source: ExtractionSource = 'OCR_TEXT'): ExtractedField<T> {
  return {
    value: null,
    confidence: 0,
    source,
    rawText: null,
    needsReview: false,
  };
}

function makeField<T>(
  value: T | null,
  confidence: number,
  source: ExtractionSource,
  rawText?: string | null,
): ExtractedField<T> {
  const clamped = Math.max(0, Math.min(100, Math.round(confidence)));
  return {
    value,
    confidence: value !== null && value !== undefined && value !== '' ? clamped : 0,
    source,
    rawText: rawText || null,
    needsReview:
      value !== null &&
      value !== undefined &&
      value !== '' &&
      clamped < DNB_CONFIDENCE_REVIEW_THRESHOLD,
  };
}

/**
 * Broad field & UI section boundary detector so extracting one field never spills
 * into a neighboring card/row or portal chrome (e.g., Portfolio, Regional Insight).
 */
const ANY_FIELD_HEADER_REGEX =
  /^(?:company\s+name|business\s+name|legal\s+name|entity\s+name|trade\s*name|tradestyle|doing\s+business\s+as|dba|d-?u-?n-?s(?:\s*(?:no|number|#))?|duns(?:\s*(?:no|number|#))?|registration(?:\s*(?:no|number|#))?|reg\.?\s*(?:no|#)|chamber\s+of\s+commerce|krs|hrb|siret|siren|kvk|vat(?:\s*(?:no|number|id|#))?|tax\s*id|gstin|nip|ust-idnr|legal\s+(?:form|structure|status)|rechtsform|forma\s+prawna|forme\s+juridique|ownership(?:\s+type)?|company\s+status|operating\s+status|business\s+status|headquarters|branch\s+indicator|location\s+type|address|registered\s+address|business\s+address|street(?:\s+address)?|area|city|state|province|country(?:\s*\/\s*region)?|country\s+name|nation|postal\s*code|zip(?:\s*code)?|postcode|phone|telephone|tel\.?|mobile|cell|fax|e-?mail|website|web|url|homepage|line\s+of\s+business|industry|sector|branche|business\s+description|company\s+description|sic(?:\s+code)?|naics(?:\s+code)?|annual\s+sales|annual\s+turnover|annual\s+revenue|sales\s+turnover|operating\s+revenue|total\s+revenue|turnover|revenue|jahresumsatz|chiffre\s+d['’]affaires|latest\s+financial(?:\s+statement)?\s+date|financial\s+(?:statement\s+)?date|statement\s+date|report\s+date|fiscal\s+year\s+end|employees?|employee\s+count|number\s+of\s+employees|total\s+employees|staff|headcount|mitarbeiter|pracownicy|zatrudnienie|year\s+(?:established|started|founded)|established|founded|incorporation\s+date|date\s+of\s+incorporation|age\s*\(?year|d&b\s+rating|credit\s+rating|rating|failure\s+score|viability\s+score|paydex(?:\s+score)?|delinquency\s+score|financial\s+stress\s+score|credit\s+limit|maximum\s+credit|recommended\s+credit|risk\s+(?:class|factor|level|tier|indicator|recommendation)|parent\s+company|immediate\s+parent|global\s+parent|ultimate\s+parent|domestic\s+ultimate|global\s+ultimate|directors?|key\s+principals?|management|principals?|officers?|owner(?:\s+name)?|partner\s+name|import\s*\/?\s*export|public\s*\/?\s*private|number\s+of\s+branches|branches|legal\s+events|bankruptcy(?:\s+status)?|business\s+activity|regional\s+insight|country\s*\/\s*regional\s+insight|portfolio|overview|financials?|peer\s+comparison|industry\s+norms?|industry\s+ratios?|corporate\s+linkage|family\s+tree|get\s+report|view\s+report)\b/i;

function isAnyLabelLine(text: string): boolean {
  if (!text) return false;
  return ANY_FIELD_HEADER_REGEX.test(text.trim());
}

interface LayoutFieldExtraction {
  value: string;
  source: ExtractionSource;
  rawText: string;
  isExactSpatialCard: boolean;
}

/**
 * Extracts text belonging to a labeled field using spatial OCR/PDF card bounding boxes
 * first, falling back to multi-line text extraction stopped at the next field label.
 */
function extractLabeledBlock(
  ocrLines: OcrBoxLine[],
  fullText: string,
  labelPatterns: RegExp[],
  options: {
    maxLines?: number;
    allowMultiLine?: boolean;
    lineSeparator?: string;
    rejectPattern?: RegExp;
    baseSource?: ExtractionSource;
  } = {},
): LayoutFieldExtraction | null {
  const maxLines = options.maxLines ?? 1;
  const allowMultiLine = options.allowMultiLine ?? maxLines > 1;
  const lineSeparator = options.lineSeparator ?? (allowMultiLine ? ', ' : ' ');
  const baseSource = options.baseSource ?? 'OCR_TEXT';

  // 1. Spatial layout extraction when OCR / PDF bounding boxes exist
  if (ocrLines && ocrLines.length > 0) {
    for (const labelPattern of labelPatterns) {
      for (let i = 0; i < ocrLines.length; i++) {
        const labelBox = ocrLines[i];
        const match = labelBox.text.match(labelPattern);
        if (!match || match.index === undefined) continue;
        if (options.rejectPattern && options.rejectPattern.test(labelBox.text)) {
          continue;
        }

        // Inline value right after the label on the same segment box
        let afterLabel = labelBox.text
          .slice(match.index + match[0].length)
          .replace(/^[\s:\-–—|]+/, '')
          .trim();

        // Trim any secondary label embedded at the end of the same box
        if (afterLabel) {
          const splitOnNextLabel = afterLabel.search(
            /\s{2,}(?=[\p{L}][\p{L}\s/&'-]{2,30}:)/u,
          );
          if (splitOnNextLabel > 0) {
            afterLabel = afterLabel.slice(0, splitOnNextLabel).trim();
          }
          if (
            afterLabel &&
            !isAnyLabelLine(afterLabel) &&
            !isUiChromeOrNoise(afterLabel)
          ) {
            return {
              value: afterLabel,
              source: baseSource === 'PDF_TEXT' ? 'PDF_TEXT' : 'OCR_SPATIAL',
              rawText: labelBox.text.trim(),
              isExactSpatialCard: true,
            };
          }
        }

        const page = labelBox.page ?? 1;
        const labelHeight = Math.max(12, labelBox.y1 - labelBox.y0);
        const labelMidY = (labelBox.y0 + labelBox.y1) / 2;

        let minX = Math.max(0, labelBox.x0 - 45);
        let maxX = Number.POSITIVE_INFINITY;
        let maxY = Number.POSITIVE_INFINITY;

        for (let n = 0; n < ocrLines.length; n++) {
          if (n === i) continue;
          const nBox = ocrLines[n];
          if ((nBox.page ?? 1) !== page) continue;
          if (!isAnyLabelLine(nBox.text) && !isUiChromeOrNoise(nBox.text)) continue;

          const nMidY = (nBox.y0 + nBox.y1) / 2;
          if (Math.abs(nMidY - labelMidY) <= labelHeight * 1.8) {
            if (nBox.x0 >= labelBox.x1 - 4) {
              maxX = Math.min(maxX, nBox.x0 - 6);
            } else if (nBox.x1 <= labelBox.x0 + 4) {
              minX = Math.max(minX, nBox.x1 + 6);
            }
          }
        }

        for (let n = 0; n < ocrLines.length; n++) {
          if (n === i) continue;
          const nBox = ocrLines[n];
          if ((nBox.page ?? 1) !== page) continue;
          if (!isAnyLabelLine(nBox.text) && !isUiChromeOrNoise(nBox.text)) continue;

          if (nBox.y0 > labelBox.y1 - 2 && nBox.x0 < maxX && nBox.x1 > minX) {
            maxY = Math.min(maxY, nBox.y0 - 4);
          }
        }

        maxY = Math.min(maxY, labelBox.y1 + labelHeight * (allowMultiLine ? 10 : 4.5));

        const cardBoxes = ocrLines.filter((other, idx) => {
          if (idx === i) return false;
          if ((other.page ?? 1) !== page) return false;
          if (isAnyLabelLine(other.text) || isUiChromeOrNoise(other.text)) return false;

          const otherMidY = (other.y0 + other.y1) / 2;
          const sameRowRight =
            Math.abs(otherMidY - labelMidY) <= labelHeight * 1.2 &&
            other.x0 >= labelBox.x0 &&
            other.x0 < maxX;

          const belowInCard =
            other.y0 >= labelBox.y1 - 4 &&
            other.y1 <= maxY &&
            other.x0 >= minX - 10 &&
            other.x0 < maxX &&
            other.x1 > minX;

          return sameRowRight || belowInCard;
        });

        if (cardBoxes.length > 0) {
          cardBoxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
          const chosenBoxes = allowMultiLine
            ? cardBoxes.slice(0, maxLines)
            : [cardBoxes[0]];
          const value = chosenBoxes
            .map((b) => b.text.trim())
            .filter(Boolean)
            .join(lineSeparator)
            .trim();
          if (value) {
            return {
              value,
              source: baseSource === 'PDF_TEXT' ? 'PDF_TEXT' : 'OCR_SPATIAL',
              rawText: `${labelBox.text.trim()} | ${value}`,
              isExactSpatialCard: true,
            };
          }
        }
      }
    }
  }

  // 2. Text-line fallback
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const labelPattern of labelPatterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(labelPattern);
      if (!match || match.index === undefined) continue;
      if (options.rejectPattern && options.rejectPattern.test(line)) continue;

      const afterLabel = line
        .slice(match.index + match[0].length)
        .replace(/^[\s:\-–—|]+/, '')
        .trim();

      if (
        afterLabel &&
        !isAnyLabelLine(afterLabel) &&
        !isUiChromeOrNoise(afterLabel)
      ) {
        return {
          value: afterLabel,
          source: baseSource,
          rawText: line,
          isExactSpatialCard: false,
        };
      }

      const collected: string[] = [];
      for (let off = 1; off <= maxLines && i + off < lines.length; off++) {
        const nextLine = lines[i + off];
        if (isAnyLabelLine(nextLine) || isUiChromeOrNoise(nextLine)) break;
        collected.push(nextLine);
        if (!allowMultiLine) break;
      }
      if (collected.length > 0) {
        const joined = collected.join(lineSeparator).trim();
        return {
          value: joined,
          source: baseSource,
          rawText: `${line} | ${joined}`,
          isExactSpatialCard: false,
        };
      }
    }
  }

  return null;
}

export function normalizeDunsNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{2})[-\s]?(\d{3})[-\s]?(\d{4})\b/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizeDateToIso(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const iso = trimmed.match(/\b((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD.MM.YYYY, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
  const dmy = trimmed.match(/\b(\d{1,2})([./-])(\d{1,2})\2((?:19|20)\d{2})\b/);
  if (dmy) {
    const a = Number(dmy[1]);
    const sep = dmy[2];
    const b = Number(dmy[3]);
    const y = Number(dmy[4]);
    let day = a;
    let month = b;
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else if (sep === '/' && a <= 12 && b <= 12) {
      // Ambiguous slash date; keep DD/MM unless clearly US
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Named months: "15 Nov 2025", "Nov 15, 2025", "31 December 2024"
  const months: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  const dayFirst = trimmed.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+((?:19|20)\d{2})\b/i,
  );
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = months[dayFirst[2].toLowerCase()];
    const y = Number(dayFirst[3]);
    if (month && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const monthFirst = trimmed.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})[,\s]+((?:19|20)\d{2})\b/i,
  );
  if (monthFirst) {
    const month = months[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    const y = Number(monthFirst[3]);
    if (month && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function extractIntegerInRange(
  raw: string | null | undefined,
  min: number,
  max: number,
): number | null {
  if (!raw) return null;
  // Handle "82 / 100" or "82 out of 100"
  const ratio = raw.match(/\b(\d{1,3})\s*(?:\/|out\s+of)\s*100\b/i);
  if (ratio) {
    const val = Number(ratio[1]);
    return val >= min && val <= max ? val : null;
  }
  const clean = raw.replace(/(?<=\d),(?=\d{3}\b)/g, '');
  const m = clean.match(/\b(\d{1,7})\b/);
  if (!m) return null;
  const num = Number(m[1]);
  return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

function parseDnbRatingCode(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  // Typical D&B ratings: 2A 1, EE1, 5A 2, 1R 3, N 2, O 3, DS, NQ, BB2, 4A1
  const match = trimmed.match(
    /\b([1-5]A\s*[1-4]|1R\s*[1-4]|2R\s*[1-4]|[A-Z]{1,2}\s*[1-4]|DS|NQ|NB|ER\s*[1-4]|BR\s*[1-4])\b/,
  );
  if (match) return match[1].replace(/\s+/g, ' ').trim();
  if (/^[A-Z0-9\s-]{2,12}$/.test(trimmed) && !/^\d{4,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function mapRiskClass(raw?: string | null): 'LOW' | 'MODERATE' | 'HIGH' | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/\b(?:very\s+high|high\s+risk|high\s+default|severe|elevated|critical)\b/.test(lower)) {
    return 'HIGH';
  }
  if (/\b(?:moderate|medium|average|fair|caution)\b/.test(lower)) {
    return 'MODERATE';
  }
  if (/\b(?:very\s+low|low\s+risk|minimal|strong|good)\b/.test(lower)) {
    return 'LOW';
  }
  return null;
}

function parseWebsiteValue(raw?: string | null): string | null {
  if (!raw) return null;
  // Do not treat emails as websites
  const withoutEmails = raw.replace(/\S+@\S+\.\S+/g, ' ');
  const m = withoutEmails.match(
    /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\/[^\s,;]*)?)\b/i,
  );
  if (!m) return null;
  const candidate = m[1].trim().replace(/[.,;)]+$/, '');
  if (!/\.[a-z]{2,}$/i.test(candidate.split('/')[0])) return null;
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function parseEmailValue(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return m ? m[1].toLowerCase() : null;
}

function parsePhoneValue(raw?: string | null): string | null {
  if (!raw) return null;
  // Avoid matching a 9-digit DUNS like 31-528-9042 when explicitly formatted XX-XXX-XXXX unless phone label has + or ()
  const trimmed = raw.trim();
  const m = trimmed.match(/(\+?\d[\d\s().-]{6,22}\d)/);
  if (!m) return null;
  const candidate = m[1].trim();
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 16) return null;
  return candidate;
}

function parseAddressComponents(
  rawFullAddress: string | null,
  ocrLines: OcrBoxLine[],
  fullText: string,
  baseSource: ExtractionSource,
) {
  const streetBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:street(?:\s+address)?|ulica)\b/i],
    { maxLines: 1, baseSource },
  );
  const areaBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:area|district|locality)\b/i],
    { maxLines: 1, baseSource },
  );
  const cityBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:city|town|municipality)\b/i],
    {
      maxLines: 1,
      baseSource,
      rejectPattern: /\b(?:city\s+limit|inner\s+city|capital\s+city\s+note)\b/i,
    },
  );
  const stateBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:state|province|voivodeship|wojew[oó]dztwo|county)\b/i],
    { maxLines: 1, baseSource },
  );
  const countryBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:country\s*\/\s*region|country\s+name|nation|country)\b/i],
    {
      maxLines: 1,
      baseSource,
      rejectPattern:
        /\b(?:country\s*\/\s*regional\s+insight|regional\s+insight|country\s+risk|country\s+insight)\b/i,
    },
  );
  const postalBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:postal\s*code|zip\s*code|zip\s*\/\s*postal\s*code|postcode|kod\s+pocztowy)\b/i],
    { maxLines: 1, baseSource },
  );

  // Clean & validate labeled fields strictly against semantic rules
  const labeledStreet =
    streetBlock?.value && !isUiChromeOrNoise(streetBlock.value)
      ? streetBlock.value.trim()
      : null;
  const labeledArea =
    areaBlock?.value && !isUiChromeOrNoise(areaBlock.value)
      ? areaBlock.value.trim()
      : null;
  const labeledCity = isValidCityName(cityBlock?.value)
    ? cityBlock!.value.trim()
    : null;
  const labeledState =
    stateBlock?.value && !isUiChromeOrNoise(stateBlock.value)
      ? stateBlock.value.trim()
      : null;
  const labeledCountry = normalizeAndValidateCountry(countryBlock?.value);
  const labeledPostal =
    postalBlock?.value && !isUiChromeOrNoise(postalBlock.value)
      ? postalBlock.value.trim()
      : null;

  // Intelligently decompose labeled Address block OR unlabeled spatial address cluster
  const decomposedFromLabeled = rawFullAddress
    ? decomposeAddressText(rawFullAddress)
    : null;
  const decomposedFromCluster =
    !decomposedFromLabeled?.fullAddress ||
    !decomposedFromLabeled.city ||
    !decomposedFromLabeled.country
      ? detectAddressClusterFromLayout(ocrLines, fullText)
      : null;

  const decomposed =
    decomposedFromLabeled &&
    (decomposedFromLabeled.country ||
      decomposedFromLabeled.city ||
      decomposedFromLabeled.postalCode)
      ? decomposedFromLabeled
      : decomposedFromCluster || decomposedFromLabeled;

  const street = labeledStreet || decomposed?.street || null;
  const city = labeledCity || decomposed?.city || null;
  const stateProvince = labeledState || decomposed?.stateProvince || null;
  const country = labeledCountry || decomposed?.country || null;
  const postalCode = labeledPostal || decomposed?.postalCode || null;

  const cleanCombinedParts = [
    street,
    labeledArea,
    postalCode,
    city,
    stateProvince,
    country,
  ].filter(Boolean);

  const sanitizedRawFull =
    rawFullAddress && !isUiChromeOrNoise(rawFullAddress)
      ? rawFullAddress
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s && !isUiChromeOrNoise(s))
          .join(', ')
      : null;

  const combinedFull =
    (cleanCombinedParts.length >= 2 ? cleanCombinedParts.join(', ') : null) ||
    decomposed?.fullAddress ||
    sanitizedRawFull ||
    null;

  // Confidence scoring (fields < 80% are flagged needsReview and only suggested, not auto-filled)
  const hasAddressAnchor = Boolean(country && (postalCode || city || street));
  const streetConf = labeledStreet ? 92 : street && hasAddressAnchor ? 86 : street ? 68 : 0;
  const cityConf = labeledCity
    ? 92
    : city && (postalCode || rawFullAddress) && country
      ? 86
      : city
        ? 70
        : 0;
  const countryConf = labeledCountry
    ? 96
    : country && (postalCode || street || city)
      ? 92
      : country
        ? 74
        : 0;
  const postalConf = labeledPostal ? 94 : postalCode ? 88 : 0;
  const stateConf = labeledState ? 90 : stateProvince && country ? 82 : stateProvince ? 68 : 0;
  const fullConf = combinedFull
    ? rawFullAddress || hasAddressAnchor
      ? 90
      : 72
    : 0;

  return {
    fullAddress: makeField(combinedFull, fullConf, baseSource, rawFullAddress),
    street: makeField(street, streetConf, baseSource),
    area: makeField(labeledArea, labeledArea ? 86 : 0, baseSource),
    city: makeField(city, cityConf, baseSource),
    stateProvince: makeField(stateProvince, stateConf, baseSource),
    country: makeField(country, countryConf, baseSource),
    postalCode: makeField(postalCode, postalConf, baseSource),
  };
}

function parseDirectors(
  ocrLines: OcrBoxLine[],
  fullText: string,
): DnbDirectorEntry[] {
  const block = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:directors?|key\s+principals?|principals?|management|officers?|managing\s+director|owner(?:\s+name)?|partner\s+name|geschäftsführer|dirigeants?)\b/i,
    ],
    { maxLines: 5, allowMultiLine: true, lineSeparator: '\n' },
  );

  if (!block || !block.value) return [];

  const entries: DnbDirectorEntry[] = [];
  const rawItems = block.value
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 100 && !isUiChromeOrNoise(s));

  for (const item of rawItems.slice(0, 6)) {
    const roleMatch = item.match(/^(.+?)\s*(?:\(([^)]+)\)|[-–—]\s*(.+))$/);
    if (roleMatch) {
      const name = roleMatch[1].trim();
      const role = (roleMatch[2] || roleMatch[3] || '').trim() || null;
      if (/\p{L}{2,}/u.test(name) && !/\d{4}/.test(name)) {
        entries.push({
          name,
          role,
          confidence: block.isExactSpatialCard ? 88 : 76,
        });
      }
    } else if (/\p{L}{2,}/u.test(item) && !/\d{4}/.test(item)) {
      entries.push({
        name: item,
        role: null,
        confidence: block.isExactSpatialCard ? 84 : 72,
      });
    }
  }

  return entries;
}

const IGNORE_HEADER_TITLE_REGEX =
  /^(?:dun\s*&\s*bradstreet|d&b|business\s+information\s+report|credit\s+report|comprehensive\s+report|d&b\s+hoovers|d&b\s+finance\s+analytics|page\s+\d+|confidential|report\s+summary|company\s+summary)/i;

function isPlausibleCompanyTitleBox(text: string): boolean {
  const cleaned = cleanCompanyNameCandidate(text);
  if (!cleaned) return false;
  if (IGNORE_HEADER_TITLE_REGEX.test(cleaned)) return false;
  if (isAnyLabelLine(cleaned)) return false;
  if (normalizeAndValidateCountry(cleaned)) return false;
  if (/@|\bhttps?:|\bwww\.|\+?\d{2,3}[\s-]\d{2,}/.test(cleaned)) return false;
  // Reject obvious street address lines like "Osina Mała 14" or postal code lines
  if (/^\d{2}-\d{3}\b|^\d+\s+[\p{L}]/u.test(cleaned)) return false;
  return /\p{L}{2,}/u.test(cleaned);
}

function inferCompanyNameFromHeader(
  fullText: string,
  ocrLines: OcrBoxLine[] = [],
): string | null {
  const page1Boxes = (ocrLines || []).filter((b) => (b.page ?? 1) === 1);

  // 1. Spatial page-top header detection (captures large wrapped multi-line D&B titles)
  if (page1Boxes.length > 0) {
    const maxY = Math.max(...page1Boxes.map((b) => b.y1), 100);
    const topThreshold = maxY * 0.42;
    const topBoxes = page1Boxes
      .filter((b) => b.y0 <= topThreshold)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const maxBoxHeight = Math.max(
      ...topBoxes.map((b) => Math.max(10, b.y1 - b.y0)),
      12,
    );

    const spatialCandidates: Array<{ text: string; score: number }> = [];

    for (let i = 0; i < topBoxes.length; i++) {
      const box = topBoxes[i];
      const base = cleanCompanyNameCandidate(box.text);
      if (!base || !isPlausibleCompanyTitleBox(base)) continue;

      const boxHeight = Math.max(10, box.y1 - box.y0);
      let merged = base;

      // Merge wrapped title line directly below if aligned and similar heading scale
      for (let j = i + 1; j < Math.min(i + 4, topBoxes.length); j++) {
        const nextBox = topBoxes[j];
        const nextClean = cleanCompanyNameCandidate(nextBox.text);
        if (!nextClean || !isPlausibleCompanyTitleBox(nextClean)) break;
        const dy = nextBox.y0 - box.y1;
        const nextHeight = Math.max(10, nextBox.y1 - nextBox.y0);
        const sameColumn = Math.abs(nextBox.x0 - box.x0) <= 75;
        const looksLikeLegalContinuation =
          /\b(?:komandytowa|akcyjna|jawna|cywilna|z\s*o\.?\s*o\.?|gmbh|limited|ltd|llc|inc)\b/iu.test(
            nextClean,
          ) || /^[A-Z\p{Lu}]{3,}$/u.test(nextClean);

        if (
          dy >= -2 &&
          dy <= boxHeight * 1.9 &&
          sameColumn &&
          nextHeight >= boxHeight * 0.72 &&
          !/^\d{2}-\d{3}\b|^\d+\s+[\p{L}]/u.test(nextClean) &&
          !normalizeAndValidateCountry(nextClean) &&
          (isTruncatedCompanyName(merged) ||
            looksLikeLegalContinuation ||
            nextHeight >= maxBoxHeight * 0.85)
        ) {
          if (merged.endsWith('-')) {
            merged = `${merged.slice(0, -1)}${nextClean}`.replace(/\s+/g, ' ').trim();
          } else {
            merged = `${merged} ${nextClean}`.replace(/\s+/g, ' ').trim();
          }
        } else if (dy > boxHeight * 2) {
          break;
        }
      }

      let score = 0;
      if (LEGAL_FORM_SUFFIX_REGEX.test(merged)) score += 60;
      if (!isTruncatedCompanyName(merged)) score += 30;
      if (boxHeight >= maxBoxHeight * 0.82) score += 20;
      if (i < 5) score += 10;
      if (merged === merged.toUpperCase() && merged.length >= 6) score += 10;
      score += Math.min(20, merged.split(/\s+/).length * 3);

      spatialCandidates.push({ text: merged, score });
    }

    if (spatialCandidates.length > 0) {
      spatialCandidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
      if (spatialCandidates[0].score >= 50) {
        return spatialCandidates[0].text;
      }
    }
  }

  // 2. Top-lines fallback when spatial boxes are absent
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 140);

  const candidates: string[] = [];
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cleaned = cleanCompanyNameCandidate(lines[i]);
    if (!cleaned || !isPlausibleCompanyTitleBox(cleaned)) continue;

    let combined = cleaned;
    if (i + 1 < Math.min(10, lines.length)) {
      const nextCleaned = cleanCompanyNameCandidate(lines[i + 1]);
      if (
        nextCleaned &&
        isPlausibleCompanyTitleBox(nextCleaned) &&
        (isTruncatedCompanyName(cleaned) ||
          LEGAL_FORM_SUFFIX_REGEX.test(`${cleaned} ${nextCleaned}`)) &&
        !LEGAL_FORM_SUFFIX_REGEX.test(cleaned)
      ) {
        combined = `${cleaned} ${nextCleaned}`.replace(/\s+/g, ' ').trim();
      }
    }

    if (LEGAL_FORM_SUFFIX_REGEX.test(combined)) {
      candidates.push(combined);
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const aTrunc = isTruncatedCompanyName(a) ? 1 : 0;
      const bTrunc = isTruncatedCompanyName(b) ? 1 : 0;
      if (aTrunc !== bTrunc) return aTrunc - bTrunc;
      return b.length - a.length;
    });
    return candidates[0];
  }

  return null;
}

export function parseFullDnbReport(
  fullText: string,
  ocrLines: OcrBoxLine[] = [],
  baseSource: ExtractionSource = 'OCR_TEXT',
): ParsedDnbReport {
  const currentYear = new Date().getFullYear();

  const textField = (
    patterns: RegExp[],
    confExact = 94,
    confText = 84,
    options: {
      maxLines?: number;
      allowMultiLine?: boolean;
      lineSeparator?: string;
      rejectPattern?: RegExp;
    } = {},
  ): ExtractedField<string> => {
    const found = extractLabeledBlock(ocrLines, fullText, patterns, {
      ...options,
      baseSource,
    });
    if (!found || !found.value) return emptyField<string>(baseSource);
    return makeField(
      found.value,
      found.isExactSpatialCard ? confExact : confText,
      found.source,
      found.rawText,
    );
  };

  // 1. Company Info (prefer complete legal name from top header if explicit field is truncated or missing)
  const explicitRaw = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:company\s+name|business\s+name|legal\s+name|registered\s+name|entity\s+name|organization\s+name)\b/i,
    ],
    {
      maxLines: 1,
      allowMultiLine: false,
      baseSource,
    },
  );
  const explicitCleaned = cleanCompanyNameCandidate(explicitRaw?.value);
  const inferredHeader = inferCompanyNameFromHeader(fullText, ocrLines);

  let chosenCompany: string | null = null;
  let companyConf = 0;
  let companySource: ExtractionSource = baseSource;
  let companyRaw: string | null = null;

  if (
    explicitCleaned &&
    !isTruncatedCompanyName(explicitCleaned)
  ) {
    // If top-header candidate starts with the same words and is noticeably longer (full legal name), prefer it
    if (
      inferredHeader &&
      !isTruncatedCompanyName(inferredHeader) &&
      inferredHeader.toLowerCase().startsWith(explicitCleaned.toLowerCase()) &&
      inferredHeader.length > explicitCleaned.length + 2
    ) {
      chosenCompany = inferredHeader;
      companyConf = 90;
      companySource = 'OCR_SPATIAL';
      companyRaw = inferredHeader;
    } else {
      chosenCompany = explicitCleaned;
      companyConf = explicitRaw?.isExactSpatialCard ? 96 : 88;
      companySource = explicitRaw?.source || baseSource;
      companyRaw = explicitRaw?.rawText || explicitCleaned;
    }
  } else if (inferredHeader && !isTruncatedCompanyName(inferredHeader)) {
    chosenCompany = inferredHeader;
    companyConf = LEGAL_FORM_SUFFIX_REGEX.test(inferredHeader) ? 88 : 76;
    companySource = ocrLines.length > 0 ? 'OCR_SPATIAL' : 'DERIVED';
    companyRaw = inferredHeader;
  } else if (explicitCleaned) {
    // Truncated explicit name (confidence < 80 -> suggested for review, not blindly auto-filled)
    chosenCompany = explicitCleaned;
    companyConf = 62;
    companySource = explicitRaw?.source || baseSource;
    companyRaw = explicitRaw?.rawText || explicitCleaned;
  } else if (inferredHeader) {
    chosenCompany = inferredHeader;
    companyConf = 60;
    companySource = 'DERIVED';
    companyRaw = inferredHeader;
  }

  const companyName = chosenCompany
    ? makeField(chosenCompany, companyConf, companySource, companyRaw)
    : emptyField<string>(baseSource);

  const tradeName = textField([
    /\b(?:trade\s*name|tradestyle|trading\s+as|doing\s+business\s+as|dba|also\s+known\s+as)\b/i,
  ]);

  const rawDunsBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:d-?u-?n-?s(?:\s*(?:no|number|#))?|duns(?:\s*(?:no|number|#))?)\b/i],
    { baseSource },
  );
  const dunsVal = normalizeDunsNumber(rawDunsBlock?.value || '');
  const dunsNumber = dunsVal
    ? makeField(
        dunsVal,
        rawDunsBlock?.isExactSpatialCard ? 98 : 90,
        rawDunsBlock?.source || baseSource,
        rawDunsBlock?.rawText,
      )
    : emptyField<string>(baseSource);

  const registrationNumber = textField([
    /\b(?:registration\s*(?:no|number|#)|company\s+registration|reg\.?\s*(?:no|#)|chamber\s+of\s+commerce|krs|hrb|cin|siret|siren|kvk|uen)\b/i,
  ]);

  const vatNumber = textField([
    /\b(?:vat\s*(?:no|number|id|#)|tax\s+id|gstin|tin|ein|nip|steuernummer|ust-idnr|partita\s+iva)\b/i,
  ]);

  const legalForm = textField([
    /\b(?:legal\s+(?:form|structure)|entity\s+type|business\s+form|organization\s+type|company\s+type|rechtsform|forma\s+prawna|forme\s+juridique|forma\s+jur[ií]dica)\b/i,
  ]);

  const ownership = textField([
    /\b(?:ownership(?:\s+type)?|shareholding|owned\s+by)\b/i,
  ]);

  const companyStatus = textField(
    [/\b(?:company\s+status|operating\s+status|business\s+status|active\s+status)\b/i],
    90,
    80,
    { rejectPattern: /\b(?:financial|bankruptcy)\s+status\b/i },
  );

  const headquarters = textField([
    /\b(?:headquarters|head\s+office|hq)\b/i,
  ]);

  const branchIndicator = textField([
    /\b(?:branch\s+indicator|location\s+type|headquarters\s*\/\s*branch|single\s+location)\b/i,
  ]);

  // 2. Address (preserve multi-line structure for Street / Postal Code / City / Country decomposition)
  const rawAddressBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:registered\s+address|business\s+address|physical\s+address|mailing\s+address|headquarters\s+address|address)\b/i,
    ],
    {
      maxLines: 5,
      allowMultiLine: true,
      lineSeparator: '\n',
      rejectPattern: /\b(?:regional\s+insight|portfolio|email\s+address|web\s+address|ip\s+address)\b/i,
      baseSource,
    },
  );
  const address = parseAddressComponents(
    rawAddressBlock?.value || null,
    ocrLines,
    fullText,
    baseSource,
  );

  // 3. Contact Info
  const phoneBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:primary\s+phone|business\s+phone|telephone|phone|tel\.?|telefon)\b/i],
    { baseSource },
  );
  const phoneVal = parsePhoneValue(phoneBlock?.value);
  const phone = phoneVal
    ? makeField(phoneVal, phoneBlock?.isExactSpatialCard ? 95 : 86, phoneBlock?.source || baseSource, phoneBlock?.rawText)
    : emptyField<string>(baseSource);

  const mobileBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:mobile(?:\s+phone)?|cell(?:\s+phone)?)\b/i],
    { baseSource },
  );
  const mobileVal = parsePhoneValue(mobileBlock?.value);
  const mobile = mobileVal
    ? makeField(mobileVal, 92, mobileBlock?.source || baseSource, mobileBlock?.rawText)
    : emptyField<string>(baseSource);

  const faxBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:fax|facsimile)\b/i],
    { baseSource },
  );
  const faxVal = parsePhoneValue(faxBlock?.value);
  const fax = faxVal
    ? makeField(faxVal, 90, faxBlock?.source || baseSource, faxBlock?.rawText)
    : emptyField<string>(baseSource);

  const emailBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:contact\s+e-?mail|e-?mail)\b/i],
    { baseSource },
  );
  const emailVal = parseEmailValue(emailBlock?.value);
  const email = emailVal
    ? makeField(emailVal, 96, emailBlock?.source || baseSource, emailBlock?.rawText)
    : emptyField<string>(baseSource);

  const websiteBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:website|web\s*site|web|url|homepage)\b/i],
    { baseSource },
  );
  const websiteVal = parseWebsiteValue(websiteBlock?.value);
  const website = websiteVal
    ? makeField(websiteVal, websiteBlock?.isExactSpatialCard ? 95 : 88, websiteBlock?.source || baseSource, websiteBlock?.rawText)
    : emptyField<string>(baseSource);

  // 4. Business Information (strictly reject explanatory ratio/norm paragraphs)
  const lobBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:primary\s+line\s+of\s+business|line\s+of\s+business|principal\s+activity)\b/i],
    { maxLines: 1, allowMultiLine: false, baseSource },
  );
  const lobClean = sanitizeIndustryValue(lobBlock?.value);
  const lineOfBusiness = lobClean
    ? makeField(lobClean, lobBlock?.isExactSpatialCard ? 92 : 84, lobBlock?.source || baseSource, lobBlock?.rawText)
    : emptyField<string>(baseSource);

  const indBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:primary\s+industry|industry\s+sector|industry|branche)\b/i],
    {
      maxLines: 1,
      allowMultiLine: false,
      rejectPattern:
        /\b(?:industry\s+(?:norms?|averages?|ratios?|benchmarks?|medians?|risk|insights?|overview|comparison|report|specific)|calculated\s+on|ratios?\s+are|peer\s+comparison)\b/i,
      baseSource,
    },
  );
  const indClean = sanitizeIndustryValue(indBlock?.value);
  const industry = indClean
    ? makeField(indClean, indBlock?.isExactSpatialCard ? 92 : 84, indBlock?.source || baseSource, indBlock?.rawText)
    : emptyField<string>(baseSource);

  const businessDescription = textField(
    [/\b(?:business\s+description|company\s+description|operations)\b/i],
    88,
    78,
    { maxLines: 4, allowMultiLine: true, lineSeparator: ' ' },
  );
  const sicCode = textField([
    /\b(?:primary\s+sic|us\s+sic|sic(?:\s+code)?)\b/i,
  ]);
  const naicsCode = textField([
    /\b(?:primary\s+naics|naics(?:\s+code)?)\b/i,
  ]);

  // 5. Financial Information (using layout-isolated Annual Sales parser)
  const parsedSales = parseAnnualSalesFromText(fullText, ocrLines);
  const salesCurrencyRes = parsedSales.found
    ? resolveAnnualSalesCurrency({
        explicitHint: parsedSales.currencyHint,
        matchedSnippet: parsedSales.rawMatchedText,
        contextSnippet: parsedSales.rawMatchedText,
        documentText: fullText,
      })
    : { currency: null, symbol: null, confidence: 'LOW' as const, source: 'NONE' as const };

  const salesConf = !parsedSales.found
    ? 0
    : parsedSales.confidence === 'HIGH'
      ? 96
      : parsedSales.confidence === 'MEDIUM'
        ? 85
        : 68;
  const currencyConf = !salesCurrencyRes.currency
    ? 0
    : salesCurrencyRes.confidence === 'HIGH'
      ? 96
      : salesCurrencyRes.confidence === 'MEDIUM'
        ? 84
        : 68;

  const dateBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:latest\s+financial(?:\s+statement)?\s+date|financial\s+(?:statement\s+)?date|statement\s+date|accounts\s+date|fiscal\s+year\s+end|report\s+date|date\s+of\s+report)\b/i,
    ],
    { baseSource },
  );
  const parsedIsoDate = normalizeDateToIso(dateBlock?.value);
  const latestFinancialDate = parsedIsoDate
    ? makeField(parsedIsoDate, dateBlock?.isExactSpatialCard ? 92 : 82, dateBlock?.source || baseSource, dateBlock?.rawText)
    : emptyField<string>(baseSource);

  // 6. Employees
  const empBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:total\s+employees|number\s+of\s+employees|employees?(?:\s*\((?:total|here)\))?|employee\s+count|staff|headcount|mitarbeiter|pracownicy|zatrudnienie|effectif|empleados)\b/i,
    ],
    { baseSource },
  );
  const empVal = extractIntegerInRange(empBlock?.value, 0, 5_000_000);
  const employeeCount =
    empVal !== null
      ? makeField(empVal, empBlock?.isExactSpatialCard ? 95 : 85, empBlock?.source || baseSource, empBlock?.rawText)
      : emptyField<number>(baseSource);

  // 7. Company Age / Year Established
  const ageBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:year\s+(?:established|started|founded)|established|founded|incorporation\s+date|date\s+(?:of\s+)?incorporation|registration\s+date|start\s+year|age\s*\(?year\s+started\)?|gr[üu]ndungsjahr|rok\s+za[łl]o[żz]enia)\b/i,
    ],
    { baseSource },
  );
  const incIsoDate = normalizeDateToIso(ageBlock?.value);
  const yearMatch = ageBlock?.value?.match(/\b(1[89]\d{2}|20\d{2})\b/);
  const parsedYear = yearMatch ? Number(yearMatch[1]) : null;
  const validYear =
    parsedYear && parsedYear >= 1800 && parsedYear <= currentYear
      ? parsedYear
      : null;

  const yearEstablished = validYear
    ? makeField(validYear, ageBlock?.isExactSpatialCard ? 95 : 85, ageBlock?.source || baseSource, ageBlock?.rawText)
    : emptyField<number>(baseSource);
  const incorporationDate = incIsoDate
    ? makeField(incIsoDate, 88, ageBlock?.source || baseSource, ageBlock?.rawText)
    : emptyField<string>(baseSource);

  // 8. D&B Risk Information
  const ratingBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:d&b\s+rating|d\s*&\s*b\s+rating|rating)\b/i],
    {
      baseSource,
      rejectPattern: /\b(?:risk\s+rating|credit\s+rating\s+history)\b/i,
    },
  );
  const ratingCode = parseDnbRatingCode(ratingBlock?.value);
  const dnbRating = ratingCode
    ? makeField(ratingCode, ratingBlock?.isExactSpatialCard ? 93 : 82, ratingBlock?.source || baseSource, ratingBlock?.rawText)
    : emptyField<string>(baseSource);

  const failureBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:d&b\s+)?(?:failure\s+score|viability\s+score)\b/i],
    { baseSource },
  );
  const failureVal = extractIntegerInRange(failureBlock?.value, 0, 100);
  const failureScore =
    failureVal !== null
      ? makeField(failureVal, failureBlock?.isExactSpatialCard ? 95 : 85, failureBlock?.source || baseSource, failureBlock?.rawText)
      : emptyField<number>(baseSource);

  const paydexBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:d&b\s+)?paydex(?:\s+score)?\b/i],
    { baseSource },
  );
  const paydexVal = extractIntegerInRange(paydexBlock?.value, 0, 100);
  const paydex =
    paydexVal !== null
      ? makeField(paydexVal, paydexBlock?.isExactSpatialCard ? 96 : 86, paydexBlock?.source || baseSource, paydexBlock?.rawText)
      : emptyField<number>(baseSource);

  const delinquencyBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:delinquency\s+score|commercial\s+credit\s+score|payment\s+risk\s+score)\b/i],
    { baseSource },
  );
  const delinqVal = extractIntegerInRange(delinquencyBlock?.value, 0, 100);
  const delinquencyScore =
    delinqVal !== null
      ? makeField(delinqVal, 90, delinquencyBlock?.source || baseSource, delinquencyBlock?.rawText)
      : emptyField<number>(baseSource);

  const stressBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:financial\s+stress\s+score|stress\s+score)\b/i],
    { baseSource },
  );
  const stressVal = extractIntegerInRange(stressBlock?.value, 0, 100);
  const financialStressScore =
    stressVal !== null
      ? makeField(stressVal, 88, stressBlock?.source || baseSource, stressBlock?.rawText)
      : emptyField<number>(baseSource);

  const creditBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [
      /\b(?:d&b\s+credit\s+limit|recommended\s+credit\s+limit|maximum\s+credit(?:\s+recommendation)?|credit\s+limit|credit\s+appraisal)\b/i,
    ],
    { baseSource },
  );
  let creditLimitVal: number | null = null;
  let creditLimitCurrencyHint: string | null = null;
  if (creditBlock?.value) {
    const cleanCredit = creditBlock.value.replace(/\b(?:no\s+credit|n\/a)\b/i, '');
    const numMatch = cleanCredit.match(
      /(\d{1,3}(?:[\s.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?)/,
    );
    if (numMatch) {
      creditLimitVal = parseLocalizedNumericValue(numMatch[1]);
      if (creditLimitVal !== null) {
        const scaleMatch = cleanCredit
          .slice((numMatch.index ?? 0) + numMatch[0].length)
          .match(/^\s*(million|mn|m|thousand|k)\b/i);
        if (scaleMatch) {
          const u = scaleMatch[1].toLowerCase();
          creditLimitVal *= u.startsWith('m') ? 1_000_000 : 1_000;
        }
        creditLimitVal = Math.round(creditLimitVal * 100) / 100;
        creditLimitCurrencyHint =
          detectCurrencyInSnippet(creditBlock.value, fullText, false) ||
          salesCurrencyRes.currency ||
          null;
      }
    }
  }
  const creditLimitOriginal =
    creditLimitVal !== null
      ? makeField(creditLimitVal, creditBlock?.isExactSpatialCard ? 92 : 82, creditBlock?.source || baseSource, creditBlock?.rawText)
      : emptyField<number>(baseSource);

  const riskClassBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:risk\s+(?:class|factor|level|tier|indicator)|overall\s+risk|failure\s+risk)\b/i],
    { baseSource },
  );
  const riskClassMapped = mapRiskClass(riskClassBlock?.value);
  const riskClass = riskClassMapped
    ? makeField(riskClassMapped, 88, riskClassBlock?.source || baseSource, riskClassBlock?.rawText)
    : emptyField<'LOW' | 'MODERATE' | 'HIGH'>(baseSource);

  const riskRecommendation = textField([
    /\b(?:risk\s+recommendation|recommended\s+action|credit\s+decision|recommendation)\b/i,
  ]);

  // 9. Parent Company
  const parentCompany = textField([
    /\b(?:immediate\s+parent|domestic\s+parent|parent\s+company|parent)\b/i,
  ]);
  const globalParent = textField([/\b(?:global\s+parent)\b/i]);
  const ultimateParent = textField([
    /\b(?:ultimate\s+parent|global\s+ultimate|domestic\s+ultimate)\b/i,
  ]);

  // 10. Directors
  const directors = parseDirectors(ocrLines, fullText);

  // 11. Additional Details
  const importExportStatus = textField([
    /\b(?:import\s*\/?\s*export(?:\s+status)?|foreign\s+trade|imports?\s+and\s+exports?)\b/i,
  ]);
  const ownershipType = textField([/\b(?:ownership\s+type|legal\s+ownership)\b/i]);
  const publicPrivateBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:public\s*\/?\s*private|publicly\s+traded|privately\s+held)\b/i],
    { baseSource },
  );
  let publicPrivateVal: string | null = publicPrivateBlock?.value || null;
  if (!publicPrivateVal) {
    if (/\bpublicly\s+traded\b/i.test(fullText)) publicPrivateVal = 'Public';
    else if (/\bprivately\s+held\b/i.test(fullText)) publicPrivateVal = 'Private';
  }
  const publicPrivate = publicPrivateVal
    ? makeField(publicPrivateVal, publicPrivateBlock ? 88 : 72, publicPrivateBlock ? (publicPrivateBlock.source) : 'DERIVED')
    : emptyField<string>(baseSource);

  const branchesBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:number\s+of\s+branches|branches|subsidiaries)\b/i],
    { baseSource },
  );
  const branchesVal = extractIntegerInRange(branchesBlock?.value, 0, 100000);
  const numberOfBranches =
    branchesVal !== null
      ? makeField(branchesVal, 86, branchesBlock?.source || baseSource, branchesBlock?.rawText)
      : emptyField<number>(baseSource);

  const legalEvents = textField([
    /\b(?:legal\s+events|suits\s*\/?\s*liens\s*\/?\s*judgments|court\s+cases|legal\s+filings)\b/i,
  ]);
  const bankruptcyStatus = textField([
    /\b(?:bankruptcy(?:\s+status)?|insolvency(?:\s+status)?)\b/i,
  ]);
  const actBlock = extractLabeledBlock(
    ocrLines,
    fullText,
    [/\b(?:business\s+activity|activities)\b/i],
    { maxLines: 1, allowMultiLine: false, baseSource },
  );
  const actClean = sanitizeIndustryValue(actBlock?.value);
  const businessActivity = actClean
    ? makeField(actClean, actBlock?.isExactSpatialCard ? 88 : 80, actBlock?.source || baseSource, actBlock?.rawText)
    : emptyField<string>(baseSource);

  return {
    companyInfo: {
      companyName,
      tradeName,
      dunsNumber,
      registrationNumber,
      vatNumber,
      legalForm,
      ownership,
      companyStatus,
      headquarters,
      branchIndicator,
    },
    address,
    contact: {
      phone,
      mobile,
      email,
      website,
      fax,
    },
    business: {
      lineOfBusiness,
      industry,
      businessDescription,
      sicCode,
      naicsCode,
    },
    financial: {
      annualSalesOriginal: parsedSales.found && parsedSales.amount !== null
        ? makeField(parsedSales.amount, salesConf, ocrLines.length > 0 ? 'OCR_SPATIAL' : baseSource, parsedSales.rawMatchedText)
        : emptyField<number>(baseSource),
      originalCurrency: salesCurrencyRes.currency
        ? makeField(salesCurrencyRes.currency, currencyConf, ocrLines.length > 0 ? 'OCR_SPATIAL' : baseSource)
        : emptyField<string>(baseSource),
      annualSalesInr: emptyField<number>('DERIVED'),
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
      isFallbackRate: false,
      latestFinancialDate,
      detectedValueDisplay: null,
    },
    employees: {
      employeeCount,
    },
    companyAge: {
      yearEstablished,
      incorporationDate,
    },
    risk: {
      dnbRating,
      failureScore,
      paydex,
      delinquencyScore,
      financialStressScore,
      creditLimitOriginal,
      creditLimitCurrency: creditLimitCurrencyHint
        ? makeField(creditLimitCurrencyHint, 84, baseSource)
        : emptyField<string>(baseSource),
      creditLimitInr: emptyField<number>('DERIVED'),
      riskClass,
      riskRecommendation,
    },
    parent: {
      parentCompany,
      globalParent,
      ultimateParent,
    },
    directors,
    additional: {
      importExportStatus,
      ownershipType,
      publicPrivate,
      numberOfBranches,
      legalEvents,
      bankruptcyStatus,
      businessActivity,
    },
    salesMeta: {
      found: parsedSales.found,
      currencyHint: parsedSales.currencyHint,
      labelMatched: parsedSales.labelMatched,
      rawMatchedText: parsedSales.rawMatchedText,
    },
    creditLimitMeta: {
      currencyHint: creditLimitCurrencyHint,
      rawMatchedText: creditBlock?.rawText || null,
    },
  };
}
