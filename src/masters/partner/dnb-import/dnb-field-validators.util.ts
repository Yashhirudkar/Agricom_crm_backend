import { OcrBoxLine } from './annual-sales-parser.util';

export const DNB_CONFIDENCE_REVIEW_THRESHOLD = 80;

/**
 * Navigation chrome, report tabs, and portal buttons that frequently appear
 * in D&B Hoovers / Finance Analytics screenshots and PDFs. These must NEVER
 * be captured as Company Name, Country, City, Address, or Industry values.
 */
export const UI_NOISE_EXACT_OR_PHRASE_REGEX =
  /^(?:\/?\s*regional\s+insight|country\s*\/\s*regional\s+insight|regional\s+insight|portfolio|map|overview|get\s+report|view\s+report|download\s+report|add\s+to\s+portfolio|single\s+location|headquarters?|subsidiary|branch|active|inactive|out\s+of\s+business|financials?|news(?:\s*&?\s*alerts?)?|corporate\s+linkage|family\s+tree|peer\s+comparison|industry\s+norms?|industry\s+ratios?|risk\s+profile|quick\s+view|analytics|summary|indicators?|ratios?|click\s+here|learn\s+more|subscribe|upgrade|dun\s*&\s*bradstreet|d&b\s+hoovers|d&b\s+finance\s+analytics)$/i;

export const UI_NOISE_CONTAINS_REGEX =
  /\b(?:regional\s+insight|country\s*\/\s*regional|get\s+report|add\s+to\s+portfolio|view\s+report|download\s+report|industry\s+norms?|peer\s+comparison|corporate\s+linkage|family\s+tree|d&b\s+hoovers|d&b\s+finance\s+analytics)\b/i;

/**
 * Canonical ISO-3166 country list + common aliases/local names so Country fields
 * never accept headings like "/REGIONAL INSIGHT" or "Portfolio".
 */
const CANONICAL_COUNTRIES: Record<string, string> = (() => {
  const map: Record<string, string> = {
    usa: 'United States',
    'u.s.a.': 'United States',
    'u.s.': 'United States',
    us: 'United States',
    'united states': 'United States',
    'united states of america': 'United States',
    uk: 'United Kingdom',
    'u.k.': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    uae: 'United Arab Emirates',
    'u.a.e.': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',
    poland: 'Poland',
    polska: 'Poland',
    rzeczpospolita: 'Poland',
    germany: 'Germany',
    deutschland: 'Germany',
    france: 'France',
    italy: 'Italy',
    italia: 'Italy',
    spain: 'Spain',
    espana: 'Spain',
    españa: 'Spain',
    netherlands: 'Netherlands',
    nederland: 'Netherlands',
    holland: 'Netherlands',
    belgium: 'Belgium',
    belgie: 'Belgium',
    belgique: 'Belgium',
    switzerland: 'Switzerland',
    schweiz: 'Switzerland',
    suisse: 'Switzerland',
    austria: 'Austria',
    osterreich: 'Austria',
    österreich: 'Austria',
    czechia: 'Czech Republic',
    'czech republic': 'Czech Republic',
    slovakia: 'Slovakia',
    hungary: 'Hungary',
    romania: 'Romania',
    bulgaria: 'Bulgaria',
    lithuania: 'Lithuania',
    latvia: 'Latvia',
    estonia: 'Estonia',
    sweden: 'Sweden',
    sverige: 'Sweden',
    norway: 'Norway',
    denmark: 'Denmark',
    finland: 'Finland',
    ireland: 'Ireland',
    portugal: 'Portugal',
    greece: 'Greece',
    turkey: 'Turkey',
    turkiye: 'Turkey',
    türkiye: 'Turkey',
    ukraine: 'Ukraine',
    russia: 'Russia',
    india: 'India',
    china: 'China',
    japan: 'Japan',
    'south korea': 'South Korea',
    korea: 'South Korea',
    taiwan: 'Taiwan',
    vietnam: 'Vietnam',
    'viet nam': 'Vietnam',
    thailand: 'Thailand',
    malaysia: 'Malaysia',
    singapore: 'Singapore',
    indonesia: 'Indonesia',
    philippines: 'Philippines',
    australia: 'Australia',
    'new zealand': 'New Zealand',
    canada: 'Canada',
    mexico: 'Mexico',
    brazil: 'Brazil',
    argentina: 'Argentina',
    chile: 'Chile',
    colombia: 'Colombia',
    peru: 'Peru',
    'south africa': 'South Africa',
    egypt: 'Egypt',
    morocco: 'Morocco',
    nigeria: 'Nigeria',
    kenya: 'Kenya',
    'saudi arabia': 'Saudi Arabia',
    qatar: 'Qatar',
    kuwait: 'Kuwait',
    oman: 'Oman',
    bahrain: 'Bahrain',
    israel: 'Israel',
    jordan: 'Jordan',
    pakistan: 'Pakistan',
    bangladesh: 'Bangladesh',
    'sri lanka': 'Sri Lanka',
  };

  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < letters.length; i++) {
      for (let j = 0; j < letters.length; j++) {
        const code = `${letters[i]}${letters[j]}`;
        const resolved = regionNames.of(code);
        if (resolved && resolved !== code && !/unknown region/i.test(resolved)) {
          const normalizedKey = resolved.trim().toLowerCase();
          if (!map[normalizedKey]) {
            map[normalizedKey] = resolved.trim();
          }
        }
      }
    }
  } catch {
    // Fallback strictly to static table above if Intl.DisplayNames is unavailable
  }

  return map;
})();

const COUNTRY_NAMES_SORTED = Object.keys(CANONICAL_COUNTRIES).sort(
  (a, b) => b.length - a.length,
);

const UI_STATUS_CHIP_TAIL_REGEX =
  /\s*(?:\||•|·|-)?\s*\b(?:get\s+report|view\s+report|add\s+to\s+portfolio|active|inactive|out\s+of\s+business|single\s+location|headquarters?|hq|subsidiary|branch\s+location)\b\s*$/i;

export const LEGAL_FORM_SUFFIX_REGEX =
  /(?<![\p{L}\p{N}])(?:sp[oó][łl]ka\s+(?:komandytowo[-\s]?akcyjna|komandytowa|akcyjna|jawna|cywilna|partnerska|z\s+ograniczon[aą]\s+odpowiedzialno[śs]ci[aą])|sp\.?\s*z\s*o\.?\s*o\.?(?:\s*sp\.?\s*k\.?)?|sp\.?\s*k\.?|s\.k\.a\.?|s\.a\.?|gmbh(?:\s*&\s*co\.?\s*kg)?|mbh|kgaa|ohg|kg|ag|b\.v\.?|n\.v\.?|s\.r\.l\.?|s\.p\.a\.?|s\.l\.?|s\.a\.r\.l\.?|sarl|sas|eurl|inc\.?|ltd\.?|llc|llp|plc|pvt\.?\s*ltd\.?|corp\.?|corporation|incorporated|limited|co\.?,?\s*ltd\.?|ab|oy|oyj|a\/s|aps|as|kft\.?|zrt\.?|s\.r\.o\.?|a\.s\.?|d\.o\.o\.?)(?![\p{L}\p{N}])/iu;

export function isUiChromeOrNoise(raw?: string | null): boolean {
  if (!raw) return true;
  const trimmed = raw.replace(/^[/|:•\-\s]+/, '').trim();
  if (!trimmed) return true;
  if (UI_NOISE_EXACT_OR_PHRASE_REGEX.test(trimmed)) return true;
  if (UI_NOISE_CONTAINS_REGEX.test(trimmed)) return true;
  return false;
}

/**
 * Validates and normalizes an extracted country against canonical country names.
 * Rejects headings/UI fragments like "/REGIONAL INSIGHT", "Portfolio", "Map", etc.
 */
export function normalizeAndValidateCountry(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.trim().startsWith('/')) return null;
  if (isUiChromeOrNoise(raw)) return null;

  const cleaned = raw
    .replace(/^[:\-–—|/•\s]+|[:\-–—|/•\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /\d/.test(cleaned) || cleaned.length > 60) return null;

  const lower = cleaned.toLowerCase();
  if (CANONICAL_COUNTRIES[lower]) {
    return CANONICAL_COUNTRIES[lower];
  }

  // Handle "Warsaw, Poland" or "Poland (EU)" by checking comma/paren segments
  const subSegments = cleaned
    .split(/[,();|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (let idx = subSegments.length - 1; idx >= 0; idx--) {
    const seg = subSegments[idx];
    if (CANONICAL_COUNTRIES[seg]) {
      return CANONICAL_COUNTRIES[seg];
    }
  }

  return null;
}

export function findCountryMentionInText(raw?: string | null): string | null {
  if (!raw || isUiChromeOrNoise(raw)) return null;
  const lower = raw.toLowerCase();
  for (const key of COUNTRY_NAMES_SORTED) {
    if (key.length <= 2) continue; // avoid matching 2-letter codes anywhere in arbitrary text
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
    if (regex.test(lower)) {
      return CANONICAL_COUNTRIES[key];
    }
  }
  return null;
}

export function isValidCityName(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 55) return false;
  if (isUiChromeOrNoise(trimmed)) return false;
  if (normalizeAndValidateCountry(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  if (/[@/\\|]/.test(trimmed) || /\b(?:www\.|https?:)\b/i.test(trimmed)) return false;
  if (
    /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|ul\.|ulica|al\.|aleja|os\.|osiedle|plac|lane|ln\.?|blvd|boulevard|suite|apt|floor|building|box|po\s+box|industry|business|description|employees?|annual|sales|turnover|revenue|rating|paydex|score|limit|phone|fax|email|website|portfol[io]*|insight|report)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  // Support Unicode Latin letters (Polish ł, ó, ź; German ä, ö, ü, etc.)
  return /^[\p{L}][\p{L}\s.'’\-]{1,53}$/u.test(trimmed);
}

/**
 * Validates that an Industry / Line of Business value is an actual sector/classification
 * rather than an explanatory paragraph (e.g., "specific ratios are calculated on t...").
 */
export function sanitizeIndustryValue(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw
    .replace(/^[:\-–—|/•\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // Keep only the first meaningful line/segment if prose/footnote was glued after a separator
  const firstSegment = cleaned.split(/\s*(?:\n|\||•)\s*/)[0]?.trim() || cleaned;
  cleaned = firstSegment;

  if (cleaned.length < 2 || cleaned.length > 110) return null;
  if (isUiChromeOrNoise(cleaned)) return null;

  // Reject explanatory sentences/fragments
  if (/^[a-z]/.test(cleaned) && /\s/.test(cleaned)) {
    // Lowercase multi-word sentence fragment like "specific ratios are calculated on t..."
    return null;
  }
  if (
    /\b(?:are\s+calculated|is\s+calculated|calculated\s+on|based\s+on|for\s+each\s+industry|ratios?\s+are|benchmarks?\s+are|industry\s+norms?|peer\s+financial|this\s+(?:metric|ratio|section|report)|click\s+here|for\s+more\s+information|percentile|quartile|methodology|explanatory)\b/i.test(
      cleaned,
    )
  ) {
    return null;
  }
  if (/\.{3}$|…$/.test(cleaned) && cleaned.split(/\s+/).length >= 5) {
    return null;
  }
  // Reject bare numeric noise unless it looks like SIC/NAICS description combo
  if (/^[\d\s.,-]+$/.test(cleaned)) return null;

  return cleaned;
}

export function cleanCompanyNameCandidate(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.replace(/\s+/g, ' ').trim();
  // Strip UI badges/actions attached on the same row
  for (let pass = 0; pass < 3; pass++) {
    const next = cleaned.replace(UI_STATUS_CHIP_TAIL_REGEX, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  cleaned = cleaned.replace(/^[:\-–—|/•\s]+|[:\-–—|•\s]+$/g, '').trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 140) return null;
  if (isUiChromeOrNoise(cleaned)) return null;
  if (/^[\d\s.,-]+$/.test(cleaned)) return null;
  if (/^\S+@\S+\.\S+$/.test(cleaned) || /^https?:\/\//i.test(cleaned)) return null;
  return cleaned;
}

export function isTruncatedCompanyName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (/\.{2,}$|…$/.test(trimmed)) return true;
  // Detect obvious partial Polish/European legal endings like "SPÓŁKA KOMAN"
  if (/\bsp[oó][łl]ka\s+(?:koman|ogran|akc|jaw|cyw)\b$/iu.test(trimmed)) {
    return true;
  }
  if (/\b(?:sp\.?\s*z|sp\.?\s*z\s*o|limited\s+liab|societ[éy]\s+[àa]|gesellschaft\s+mit)\b$/iu.test(trimmed)) {
    return true;
  }
  return false;
}

export interface DecomposedAddressResult {
  street: string | null;
  postalCode: string | null;
  city: string | null;
  stateProvince: string | null;
  country: string | null;
  fullAddress: string | null;
  confidence: number;
}

const POSTAL_CODE_LINE_REGEX =
  /^([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\s*\d[ABCEGHJKLMNPRSTVWXYZ]\d|\d{2}-\d{3}|\d{5}(?:-\d{4})?|\d{4,6})$/i;

const INLINE_POSTAL_REGEX =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\s*\d[ABCEGHJKLMNPRSTVWXYZ]\d|\d{2}-\d{3}|\d{5}(?:-\d{4})?|\d{4,6})\b/i;

/**
 * Intelligently splits multi-line or comma-delimited address text such as:
 *   Osina Mała 14 / 98-358 / Kiełczygłów / Poland
 * or
 *   Osina Mała 14, 98-358 Kiełczygłów, Poland
 * into clean Street, Postal Code, City, State/Province, and Country parts.
 */
export function decomposeAddressText(rawText: string): DecomposedAddressResult {
  const empty: DecomposedAddressResult = {
    street: null,
    postalCode: null,
    city: null,
    stateProvince: null,
    country: null,
    fullAddress: null,
    confidence: 0,
  };
  if (!rawText || typeof rawText !== 'string') return empty;

  const rawTokens = rawText
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !isUiChromeOrNoise(t));

  if (rawTokens.length === 0) return empty;

  let country: string | null = null;
  let postalCode: string | null = null;
  let city: string | null = null;
  let stateProvince: string | null = null;
  const remaining: string[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];

    // Check exact country token (usually near end)
    if (!country) {
      const asCountry = normalizeAndValidateCountry(token);
      if (asCountry) {
        country = asCountry;
        continue;
      }
    }

    // Check standalone postal code line (e.g., "98-358")
    if (!postalCode && POSTAL_CODE_LINE_REGEX.test(token)) {
      postalCode = token.toUpperCase();
      continue;
    }

    remaining.push(token);
  }

  // Extract inline postal code + city from tokens like "98-358 Kiełczygłów" or "San Francisco CA 94105"
  for (let i = remaining.length - 1; i >= 0; i--) {
    const seg = remaining[i];
    const inlinePostal = seg.match(INLINE_POSTAL_REGEX);
    if (inlinePostal && !postalCode && i > 0) {
      postalCode = inlinePostal[1].toUpperCase();
      const withoutPostal = seg
        .replace(inlinePostal[0], ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Check US-style "Austin TX" / "CA"
      const stateTail = withoutPostal.match(/^(.+?)\s+([A-Z]{2})$/);
      if (stateTail && isValidCityName(stateTail[1])) {
        if (!city) city = stateTail[1].trim();
        if (!stateProvince) stateProvince = stateTail[2].trim();
        remaining.splice(i, 1);
        continue;
      }

      if (withoutPostal && isValidCityName(withoutPostal)) {
        if (!city) city = withoutPostal;
        remaining.splice(i, 1);
        continue;
      }
    }
  }

  // Check if the trailing token before Country/Postal is a US/CA state code
  if (!stateProvince && remaining.length >= 2) {
    const last = remaining[remaining.length - 1];
    if (/^[A-Z]{2}$/.test(last) && country === 'United States') {
      stateProvince = last;
      remaining.pop();
    }
  }

  // Pick city from trailing non-street token if not yet found
  if (!city && remaining.length >= 2) {
    const candidate = remaining[remaining.length - 1];
    if (isValidCityName(candidate)) {
      city = candidate;
      remaining.pop();
    }
  } else if (!city && remaining.length === 1 && postalCode && isValidCityName(remaining[0])) {
    // Only postal + city existed
    city = remaining.pop()!;
  }

  // Also handle street tokens containing inline postal like "Osina Mała 14" (keep street number intact!)
  const street = remaining.length > 0 ? remaining.join(', ') : null;

  const fullParts = [street, postalCode, city, stateProvince, country].filter(Boolean);
  const fullAddress = fullParts.length > 0 ? fullParts.join(', ') : null;

  // Score decomposition confidence
  let score = 0;
  if (country) score += 35;
  if (postalCode) score += 25;
  if (city) score += 20;
  if (street) score += 15;
  const confidence = fullAddress ? Math.min(95, Math.max(55, score)) : 0;

  return {
    street,
    postalCode,
    city,
    stateProvince,
    country,
    fullAddress,
    confidence,
  };
}

/**
 * Fallback detector for D&B header/summary screenshots where the address
 * appears cleanly without a literal "Address:" label (e.g., stacked under company name).
 */
export function detectAddressClusterFromLayout(
  ocrLines: OcrBoxLine[],
  fullText: string,
): DecomposedAddressResult | null {
  const candidates =
    ocrLines && ocrLines.length > 0
      ? ocrLines.map((l) => l.text.trim()).filter(Boolean)
      : fullText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const line = candidates[i];
    if (isUiChromeOrNoise(line)) continue;

    // Anchor on a clean Country line or Postal Code line inside the text/layout
    const directCountry = normalizeAndValidateCountry(line);
    const hasInlinePostalAndCountry =
      !directCountry &&
      (INLINE_POSTAL_REGEX.test(line) || line.includes(',')) &&
      findCountryMentionInText(line);

    if (!directCountry && !hasInlinePostalAndCountry) continue;

    // Collect up to 3 immediately preceding non-label lines belonging to the same block
    const blockLines: string[] = [line];
    const startIdx = Math.max(0, i - 3);
    const prefix: string[] = [];

    for (let j = i - 1; j >= startIdx; j--) {
      const prev = candidates[j];
      if (!prev || isUiChromeOrNoise(prev)) break;
      if (/\b(?:d-?u-?n-?s|employees?|annual\s+sales|website|phone|email|rating|paydex)\b/i.test(prev)) {
        break;
      }
      if (/@|\bhttps?:|\bwww\./i.test(prev)) break;
      // Don't swallow legal company title into street unless nothing else fits
      if (LEGAL_FORM_SUFFIX_REGEX.test(prev)) break;
      // Keep spatial proximity check when OCR boxes exist
      if (ocrLines && ocrLines.length > 0 && ocrLines[i] && ocrLines[j]) {
        if ((ocrLines[i].page ?? 1) !== (ocrLines[j].page ?? 1)) break;
        const dy = ocrLines[i].y0 - ocrLines[j].y1;
        const dx = Math.abs(ocrLines[i].x0 - ocrLines[j].x0);
        const h = Math.max(12, ocrLines[i].y1 - ocrLines[i].y0);
        if (dy > h * 6 || dy < -h || dx > 220) break;
      }
      prefix.unshift(prev);
    }

    const combined = [...prefix, ...blockLines].join('\n');
    const parsed = decomposeAddressText(combined);
    if (parsed.country && (parsed.postalCode || parsed.city || parsed.street)) {
      return parsed;
    }
  }

  return null;
}
