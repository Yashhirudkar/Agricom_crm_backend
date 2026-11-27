import { detectCurrencyInSnippet } from './currency-detector.util';

export interface OcrBoxLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  page?: number;
}

export interface ParsedAnnualSalesResult {
  found: boolean;
  amount: number | null;
  currencyHint: string | null;
  labelMatched: string | null;
  rawMatchedText: string | null;
  scaleApplied: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface LabelRule {
  name: string;
  priority: number;
  regex: RegExp;
}

const LABEL_RULES: LabelRule[] = [
  {
    name: 'Annual Sales',
    priority: 100,
    regex: /\b(?:total\s+|net\s+|gross\s+|estimated\s+)?annual\s+sales(?:\s+(?:turnover|revenue|volume|figure))?\b/i,
  },
  {
    name: 'Annual Turnover',
    priority: 98,
    regex: /\b(?:total\s+|net\s+|gross\s+|estimated\s+)?annual\s+turnover\b/i,
  },
  {
    name: 'Annual Revenue',
    priority: 96,
    regex: /\b(?:total\s+|net\s+|gross\s+|estimated\s+)?annual\s+revenue\b/i,
  },
  {
    name: 'Sales Turnover',
    priority: 92,
    regex: /\b(?:sales\s+turnover|yearly\s+sales|yearly\s+turnover)\b/i,
  },
  {
    name: 'Operating Revenue',
    priority: 85,
    regex: /\b(?:sales\s+revenue|operating\s+revenue|total\s+revenue|net\s+sales|gross\s+sales|latest\s+sales)\b/i,
  },
  {
    name: 'Turnover',
    priority: 80,
    regex: /\bturnover\b/i,
  },
  {
    name: 'Annual Sales (Multilingual)',
    priority: 95,
    regex: /(?<![A-Za-z\u00C0-\u024F])(?:jahresumsatz|gesamtumsatz|umsatz(?:erl[öo]se)?|chiffre\s+d['’]affaires(?:\s+annuel)?|roczn[ey]\s+(?:obrot|obroty|przychody|sprzeda[żz])|przychody(?:\s+ze\s+sprzeda[żz]y)?|obroty|jaaromzet|omzet|ventas\s+anuales|facturaci[oó]n(?:\s+anual)?|fatturato(?:\s+annuo)?|årsomsättning|omsättning)(?![A-Za-z\u00C0-\u024F])/i,
  },
  {
    name: 'Revenue',
    priority: 75,
    regex: /\brevenue\b/i,
  },
  {
    name: 'Sales',
    priority: 65,
    regex: /\bsales\b/i,
  },
];

const EXCLUDED_SALES_PHRASES =
  /\b(?:sales\s+tax|sales\s*person|sales\s*rep|sales\s+office|sales\s+contact|sales\s+manager|sales\s+director|sales\s+team|sales\s+channel|sales\s+growth|sales\s+margin|sales\s+volume\s+growth|cost\s+of\s+sales|days\s+sales|dso|sales\s+trend|sales\s*%|%\s*sales)\b/i;

/**
 * Other D&B field labels whose sections/cards must NEVER be read as Annual Sales.
 */
const NON_SALES_FIELD_LABEL_REGEX =
  /\b(?:employees?|employee\s+count|staff|headcount|mitarbeiter|pracownicy|zatrudnienie|effectif|empleados|ownership|legal\s+(?:form|structure|status)|rechtsform|forma\s+prawna|forme\s+juridique|d-?u-?n-?s(?:\s*(?:no|number|#))?|duns(?:\s*(?:no|number|#))?|registration(?:\s*(?:no|number|#))?|reg\.?\s*(?:no|#)|tax\s+id|vat(?:\s*(?:no|number|#))?|phone|telephone|tel\.?|telefon|fax|address|postal\s*code|zip\s*code|city|country|report\s+date|date\s+of|year\s+(?:started|established|founded)|age\s*\(?year|incorporat(?:ed|ion)|gr[üu]ndungsjahr|d&b\s+rating|credit\s+rating|rating|risk\s+(?:factor|tier|indicator|level)|credit\s+limit|maximum\s+credit|failure\s+score|paydex(?:\s+score)?|net\s+worth|tangible\s+net\s+worth|working\s+capital|total\s+assets|liabilities|website|sic|naics)\b/i;

const DATE_TOKEN_REGEX =
  /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/g;

// Mask DUNS (e.g. 31-528-9042), phone numbers (+49 30 123456), and score ratios (85/100)
const NON_MONETARY_ID_REGEX =
  /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)\s*)?\b\d{2,5}(?:[-\s]\d{2,5}){1,3}\b|\b\d+\s*\/\s*100\b/g;

/**
 * Parses international number formats:
 * - "308,528.44" -> 308528.44
 * - "308.528,44" -> 308528.44
 * - "5 109 343.09" -> 5109343.09
 * - "5 109 343,09" -> 5109343.09
 * - "28,132,730.84" -> 28132730.84
 */
export function parseLocalizedNumericValue(rawNumber: string): number | null {
  if (!rawNumber || typeof rawNumber !== 'string') return null;
  let cleaned = rawNumber.trim().replace(/\u00A0/g, ' ');
  cleaned = cleaned.replace(/(?<=\d)\s+(?=\d{3}\b)/g, '');
  cleaned = cleaned.replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;

  let normalized = cleaned;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot > lastComma) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (commaCount > 1) {
    normalized = cleaned.replace(/,/g, '');
  } else if (dotCount > 1) {
    normalized = cleaned.replace(/\./g, '');
  } else if (commaCount === 1) {
    const [, afterComma] = cleaned.split(',');
    if (afterComma.length === 3 && /^\d{1,3},\d{3}$/.test(cleaned)) {
      normalized = cleaned.replace(',', '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  } else if (dotCount === 1) {
    const [beforeDot, afterDot] = cleaned.split('.');
    if (beforeDot.length === 0) {
      normalized = '0.' + afterDot;
    }
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function detectScaleMultiplier(text: string): { scale: number; suffixText: string } {
  const m = text.match(
    /^\s*(million|mn|mln|m|billion|bn|bln|b|thousand|k|crore|cr|lakh|lakhs)\b/i,
  );
  if (!m) return { scale: 1, suffixText: '' };
  const unit = m[1].toLowerCase();
  if (unit === 'b' || unit === 'bn' || unit === 'bln' || unit === 'billion') {
    return { scale: 1_000_000_000, suffixText: m[0] };
  }
  if (unit === 'm' || unit === 'mn' || unit === 'mln' || unit === 'million') {
    return { scale: 1_000_000, suffixText: m[0] };
  }
  if (unit === 'k' || unit === 'thousand') {
    return { scale: 1_000, suffixText: m[0] };
  }
  if (unit === 'cr' || unit === 'crore') {
    return { scale: 10_000_000, suffixText: m[0] };
  }
  if (unit === 'lakh' || unit === 'lakhs') {
    return { scale: 100_000, suffixText: m[0] };
  }
  return { scale: 1, suffixText: '' };
}

function detectLabelUnitScale(labelContext: string): number {
  if (
    /\b(?:in\s+millions?|millions?\s+of)\b/i.test(labelContext) ||
    /\(\s*(?:[A-Z]{3}\s+)?(?:['’]?000[\s,.]?000|M|MLN|MN)\s*(?:[A-Z]{3})?\s*\)/i.test(
      labelContext,
    )
  ) {
    return 1_000_000;
  }
  if (
    /\b(?:in\s+thousands?|thousands?\s+of)\b/i.test(labelContext) ||
    /(?<![\d.,])['’]000['’]?s?\b/i.test(labelContext) ||
    /\(\s*(?:[A-Z]{3}\s+)?(?:in\s+)?['’]?000['’]?s?\s*(?:[A-Z]{3})?\s*\)/i.test(
      labelContext,
    )
  ) {
    return 1_000;
  }
  return 1;
}

interface MonetaryCandidate {
  amount: number;
  rawText: string;
  currencyHint: string | null;
  hasCurrency: boolean;
  hasSeparatorOrDecimal: boolean;
  index: number;
  scaleApplied: number;
}

function sanitizeForMonetaryScan(segment: string): string {
  // Preserve spaced thousand groupings like "5 109 343,09" while masking hyphenated IDs/phones & dates
  let out = segment.replace(DATE_TOKEN_REGEX, (m) => ' '.repeat(m.length));
  out = out.replace(/\b\d{1,5}(?:-\d{1,5}){1,4}\b/g, (m) => ' '.repeat(m.length));
  out = out.replace(/\+\d[\d\s-]{6,}/g, (m) => ' '.repeat(m.length));
  out = out.replace(/\b\d+\s*\/\s*100\b/g, (m) => ' '.repeat(m.length));
  // Guard explicit postal/employee/registration labels inside single-line segments
  out = out.replace(
    /\b(?:employees?|staff|headcount|postal\s*code|zip(?:\s*code)?|d-?u-?n-?s|phone|tel|fax|reg\.?\s*(?:no|#)|year(?:\s+started)?|age|paydex|failure\s+score|credit\s+limit)\s*[:=\-]?\s*\d[\d.,-]*/gi,
    (m) => ' '.repeat(m.length),
  );
  return out;
}

function extractMonetaryCandidates(
  segment: string,
  documentText: string,
  defaultHeaderScale = 1,
  sectionCurrencyFallback: string | null = null,
): MonetaryCandidate[] {
  if (!segment) return [];

  const sanitized = sanitizeForMonetaryScan(segment);
  const numRegex =
    /(?<![\dA-Za-z])(?<num>\d{1,3}(?:[\s.,]\d{3})+(?:[.,]\d{1,4})?|\d+(?:[.,]\d{1,4})?)(?!\s*%)/g;

  const candidates: MonetaryCandidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = numRegex.exec(sanitized)) !== null) {
    const rawNum = match.groups?.num || '';
    const parsedNum = parseLocalizedNumericValue(rawNum);
    if (parsedNum === null || parsedNum <= 0) continue;

    const startIdx = match.index;
    const endIdx = startIdx + match[0].length;
    const preWindow = sanitized.slice(Math.max(0, startIdx - 18), startIdx);
    const postWindow = sanitized.slice(endIdx, Math.min(sanitized.length, endIdx + 28));

    const { scale, suffixText } = detectScaleMultiplier(postWindow);
    const effectiveScale = scale > 1 ? scale : defaultHeaderScale;

    const postAfterScale = suffixText
      ? postWindow.slice(suffixText.length)
      : postWindow;

    // Inspect tight adjacent currency tokens only (handles "28,132,730.84 (EUR)", "$28.13M", "EUR 308,528.44")
    const preTail = preWindow.match(
      /(?:US\$|CA\$|AU\$|SG\$|HK\$|NZ\$|MX\$|NT\$|R\$|CN¥|JP¥|[€£₹$¥]|zł|\(?[A-Z]{3}\)?)\s*$/,
    )?.[0] || '';
    const postHead = postAfterScale.match(
      /^\s*(?:\(\s*[A-Z]{3}\s*\)|[A-Z]{3}\b|zł|[€£₹$¥]|euros?|dollars?|z[łl]ot(?:y|ych)|dirhams?|rupees?)/i,
    )?.[0] || '';

    const explicitAdjCurrency =
      detectCurrencyInSnippet(`${preTail} ${postHead}`.trim(), documentText, false) ||
      null;

    const currencyHint = explicitAdjCurrency || sectionCurrencyFallback || null;
    const hasExplicitCurrency = Boolean(explicitAdjCurrency);
    const hasSeparatorOrDecimal = /[.,]/.test(rawNum.trim()) || /(?<=\d)\s+(?=\d{3})/.test(rawNum.trim());

    // Reject plain calendar years (1900-2099) without currency or scale
    if (
      !hasExplicitCurrency &&
      effectiveScale === 1 &&
      Number.isInteger(parsedNum) &&
      parsedNum >= 1900 &&
      parsedNum <= 2099
    ) {
      continue;
    }

    // Reject bare small integers (< 10,000) without explicit currency, separator/decimal, or scale
    // (protects against employee counts like 39, 125, postal codes like 5153, and stray IDs)
    if (
      !hasExplicitCurrency &&
      !hasSeparatorOrDecimal &&
      effectiveScale === 1 &&
      parsedNum < 10000
    ) {
      continue;
    }

    const scaledAmount = Math.round(parsedNum * effectiveScale * 100) / 100;
    const rawMatched = `${preTail}${rawNum}${suffixText}${postHead}`.trim();

    candidates.push({
      amount: scaledAmount,
      rawText: rawMatched,
      currencyHint,
      hasCurrency: Boolean(currencyHint),
      hasSeparatorOrDecimal,
      index: startIdx,
      scaleApplied: effectiveScale,
    });
  }

  return candidates;
}

function findBestSalesLabel(line: string): LabelRule | null {
  if (!line) return null;
  const cleaned = line.replace(EXCLUDED_SALES_PHRASES, ' ');
  let best: LabelRule | null = null;
  for (const rule of LABEL_RULES) {
    if (rule.regex.test(cleaned)) {
      if (!best || rule.priority > best.priority) {
        best = rule;
      }
    }
  }
  return best;
}

function isNonSalesLabelBox(line: string): boolean {
  if (!line) return false;
  if (findBestSalesLabel(line)) return false;
  return NON_SALES_FIELD_LABEL_REGEX.test(line);
}

function chooseBestMonetaryCandidate(
  candidates: MonetaryCandidate[],
): MonetaryCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.hasCurrency !== b.hasCurrency) return a.hasCurrency ? -1 : 1;
    if (a.hasSeparatorOrDecimal !== b.hasSeparatorOrDecimal) {
      return a.hasSeparatorOrDecimal ? -1 : 1;
    }
    return b.amount - a.amount;
  });
  return sorted[0];
}

function trySpatialParsing(
  ocrLines: OcrBoxLine[],
  fullText: string,
): ParsedAnnualSalesResult | null {
  if (!ocrLines || ocrLines.length === 0) return null;

  const pageLabelBoxes = ocrLines.map((box, index) => ({
    index,
    box,
    salesRule: findBestSalesLabel(box.text),
    isOtherLabel: isNonSalesLabelBox(box.text),
  }));

  let bestMatch: {
    priorityScore: number;
    candidate: MonetaryCandidate;
    label: LabelRule;
    rawSnippet: string;
  } | null = null;

  for (const labelItem of pageLabelBoxes) {
    if (!labelItem.salesRule) continue;

    const labelBox = labelItem.box;
    const labelRule = labelItem.salesRule;
    const page = labelBox.page ?? 1;
    const labelHeight = Math.max(12, labelBox.y1 - labelBox.y0);
    const labelScale = detectLabelUnitScale(labelBox.text);
    const labelCurrencyHint = detectCurrencyInSnippet(labelBox.text, fullText, false);

    // Determine horizontal and vertical bounds of this Annual Sales card/section
    // using neighboring labels (Employees, D-U-N-S, Credit Limit, Year Started, etc.)
    let minX = Math.max(0, labelBox.x0 - 140);
    let maxX = Number.POSITIVE_INFINITY;
    let maxY = Number.POSITIVE_INFINITY;

    for (const neighbor of pageLabelBoxes) {
      if (neighbor.index === labelItem.index) continue;
      const nBox = neighbor.box;
      if ((nBox.page ?? 1) !== page) continue;
      if (!neighbor.salesRule && !neighbor.isOtherLabel) continue;

      const sameRowBand =
        Math.abs((nBox.y0 + nBox.y1) / 2 - (labelBox.y0 + labelBox.y1) / 2) <=
        labelHeight * 1.8;

      if (sameRowBand) {
        if (nBox.x0 >= labelBox.x1 - 4) {
          maxX = Math.min(maxX, nBox.x0 - 6);
        } else if (nBox.x1 <= labelBox.x0 + 4) {
          minX = Math.max(minX, nBox.x1 + 6);
        }
      }
    }

    for (const neighbor of pageLabelBoxes) {
      if (neighbor.index === labelItem.index) continue;
      const nBox = neighbor.box;
      if ((nBox.page ?? 1) !== page) continue;
      if (!neighbor.salesRule && !neighbor.isOtherLabel) continue;

      const belowLabel = nBox.y0 > labelBox.y1 - 2;
      const inColumnBand = nBox.x0 < maxX && nBox.x1 > minX;
      if (belowLabel && inColumnBand) {
        maxY = Math.min(maxY, nBox.y0 - 4);
      }
    }

    // Limit vertical reach to a reasonable card/section window below the label
    maxY = Math.min(maxY, labelBox.y1 + labelHeight * 8.5);

    // 1. Check inline value on the label box itself (after the matched label)
    const labelMatch = labelBox.text.match(labelRule.regex);
    if (labelMatch && labelMatch.index !== undefined) {
      const afterLabel = labelBox.text.slice(
        labelMatch.index + labelMatch[0].length,
      );
      const inlineCands = extractMonetaryCandidates(
        afterLabel,
        fullText,
        labelScale,
        labelCurrencyHint,
      );
      const bestInline = chooseBestMonetaryCandidate(inlineCands);
      if (bestInline) {
        const score =
          labelRule.priority * 10 +
          (bestInline.hasCurrency ? 200 : 0) +
          (bestInline.hasSeparatorOrDecimal ? 50 : 0) +
          Math.log10(Math.max(10, bestInline.amount));
        if (!bestMatch || score > bestMatch.priorityScore) {
          bestMatch = {
            priorityScore: score,
            candidate: bestInline,
            label: labelRule,
            rawSnippet: labelBox.text.trim(),
          };
        }
        continue;
      }
    }

    // 2. Collect ONLY boxes inside the Annual Sales card/section bounds:
    //    (a) directly to the right on the same row before maxX
    //    (b) directly below inside [minX .. maxX] and before maxY
    const cardBoxes = ocrLines.filter((other, idx) => {
      if (idx === labelItem.index) return false;
      if ((other.page ?? 1) !== page) return false;
      if (isNonSalesLabelBox(other.text) || findBestSalesLabel(other.text)) {
        return false;
      }

      const labelMidY = (labelBox.y0 + labelBox.y1) / 2;
      const otherMidY = (other.y0 + other.y1) / 2;

      const isSameRowRight =
        Math.abs(otherMidY - labelMidY) <= labelHeight * 1.2 &&
        other.x0 >= labelBox.x0 &&
        other.x0 < maxX;

      const isBelowInsideCard =
        other.y0 >= labelBox.y1 - 4 &&
        other.y1 <= maxY &&
        other.x0 >= minX - 10 &&
        other.x0 < maxX &&
        other.x1 > minX;

      return isSameRowRight || isBelowInsideCard;
    });

    if (cardBoxes.length === 0) continue;

    // Sort card boxes top-to-bottom, left-to-right and join them so split lines
    // like "28,132,730.84" followed by "(EUR)" in the same card stay associated
    cardBoxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const cardCombinedText = cardBoxes.map((b) => b.text).join(' ');
    const cardCurrency =
      labelCurrencyHint ||
      detectCurrencyInSnippet(cardCombinedText, fullText, false);

    const perBoxCandidates = cardBoxes.flatMap((box) =>
      extractMonetaryCandidates(box.text, fullText, labelScale, cardCurrency),
    );
    const combinedCandidates = extractMonetaryCandidates(
      cardCombinedText,
      fullText,
      labelScale,
      cardCurrency,
    );

    const bestCandidate = chooseBestMonetaryCandidate([
      ...combinedCandidates,
      ...perBoxCandidates,
    ]);

    if (!bestCandidate) continue;

    const score =
      labelRule.priority * 10 +
      (bestCandidate.hasCurrency ? 200 : 0) +
      (bestCandidate.hasSeparatorOrDecimal ? 50 : 0) +
      Math.log10(Math.max(10, bestCandidate.amount));

    if (!bestMatch || score > bestMatch.priorityScore) {
      bestMatch = {
        priorityScore: score,
        candidate: {
          ...bestCandidate,
          currencyHint: bestCandidate.currencyHint || cardCurrency,
        },
        label: labelRule,
        rawSnippet: `${labelBox.text.trim()} | ${cardCombinedText.trim()}`,
      };
    }
  }

  if (!bestMatch) return null;

  return {
    found: true,
    amount: bestMatch.candidate.amount,
    currencyHint: bestMatch.candidate.currencyHint,
    labelMatched: bestMatch.label.name,
    rawMatchedText: bestMatch.rawSnippet.slice(0, 220),
    scaleApplied: bestMatch.candidate.scaleApplied,
    confidence:
      bestMatch.label.priority >= 90 && bestMatch.candidate.hasCurrency
        ? 'HIGH'
        : bestMatch.candidate.hasCurrency
          ? 'MEDIUM'
          : 'LOW',
  };
}

/**
 * Layout-aware parser for D&B Annual Sales / Turnover / Revenue.
 * Strictly isolates the Annual Sales label and its spatial card/section,
 * rejecting unrelated fields (Employees, D-U-N-S, Dates, Years, Postal Codes, Ratings).
 */
export function parseAnnualSalesFromText(
  fullText: string,
  ocrLines?: OcrBoxLine[],
): ParsedAnnualSalesResult {
  if (!fullText || typeof fullText !== 'string' || !fullText.trim()) {
    return {
      found: false,
      amount: null,
      currencyHint: null,
      labelMatched: null,
      rawMatchedText: null,
      scaleApplied: 1,
      confidence: 'LOW',
    };
  }

  const documentScale = detectLabelUnitScale(fullText.slice(0, 600));

  // Prioritize spatial OCR / PDF layout bounding-box card extraction
  if (ocrLines && ocrLines.length > 0) {
    const spatialMatch = trySpatialParsing(ocrLines, fullText);
    if (spatialMatch && spatialMatch.found) {
      return spatialMatch;
    }
  }

  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let best: {
    score: number;
    candidate: MonetaryCandidate;
    label: LabelRule;
    rawSnippet: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const labelRule = findBestSalesLabel(line);
    if (!labelRule) continue;

    const labelMatch = line.match(labelRule.regex);
    if (!labelMatch || labelMatch.index === undefined) continue;

    const labelCurrencyHint = detectCurrencyInSnippet(line, fullText, false);
    const labelScale = detectLabelUnitScale(line);
    const activeScale = labelScale > 1 ? labelScale : documentScale;

    // 1. Check same line AFTER the label, stopping before any non-sales label on the same line
    let afterLabel = line.slice(labelMatch.index + labelMatch[0].length);
    const nonSalesInSameLine = afterLabel.match(NON_SALES_FIELD_LABEL_REGEX);
    if (nonSalesInSameLine && nonSalesInSameLine.index !== undefined) {
      afterLabel = afterLabel.slice(0, nonSalesInSameLine.index);
    }

    const sameLineCandidates = extractMonetaryCandidates(
      afterLabel,
      fullText,
      activeScale,
      labelCurrencyHint,
    );
    const chosenSameLine = chooseBestMonetaryCandidate(sameLineCandidates);

    if (chosenSameLine) {
      const score =
        labelRule.priority * 10 +
        (chosenSameLine.hasCurrency ? 200 : 0) +
        (chosenSameLine.hasSeparatorOrDecimal ? 50 : 0) +
        Math.log10(Math.max(10, chosenSameLine.amount));
      if (!best || score > best.score) {
        best = {
          score,
          candidate: chosenSameLine,
          label: labelRule,
          rawSnippet: `${labelMatch[0]} ${afterLabel}`.trim(),
        };
      }
      continue;
    }

    // 2. Multi-column header alignment or stacked card lines immediately below
    const columns = line.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);
    const labelColIndex = columns.findIndex((col) => labelRule.regex.test(col));

    const sectionLines: string[] = [];
    for (let offset = 1; offset <= 3 && i + offset < lines.length; offset++) {
      const nextLine = lines[i + offset];
      if (findBestSalesLabel(nextLine) || isNonSalesLabelBox(nextLine)) {
        break;
      }

      if (columns.length > 1 && labelColIndex >= 0) {
        const nextCols = nextLine.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);
        if (nextCols[labelColIndex]) {
          sectionLines.push(nextCols[labelColIndex]);
          continue;
        }
      }

      sectionLines.push(nextLine);
    }

    if (sectionLines.length === 0) continue;

    const sectionText = sectionLines.join(' ');
    const sectionCurrency =
      labelCurrencyHint ||
      detectCurrencyInSnippet(sectionText, fullText, false);
    const sectionCandidates = extractMonetaryCandidates(
      sectionText,
      fullText,
      activeScale,
      sectionCurrency,
    );
    const chosenSection = chooseBestMonetaryCandidate(sectionCandidates);

    if (chosenSection) {
      const score =
        labelRule.priority * 10 +
        (chosenSection.hasCurrency ? 200 : 0) +
        (chosenSection.hasSeparatorOrDecimal ? 50 : 0) +
        Math.log10(Math.max(10, chosenSection.amount));
      if (!best || score > best.score) {
        best = {
          score,
          candidate: {
            ...chosenSection,
            currencyHint: chosenSection.currencyHint || sectionCurrency,
          },
          label: labelRule,
          rawSnippet: `${line} | ${sectionText}`,
        };
      }
    }
  }

  if (!best) {
    return {
      found: false,
      amount: null,
      currencyHint: null,
      labelMatched: null,
      rawMatchedText: null,
      scaleApplied: 1,
      confidence: 'LOW',
    };
  }

  return {
    found: true,
    amount: best.candidate.amount,
    currencyHint: best.candidate.currencyHint,
    labelMatched: best.label.name,
    rawMatchedText: best.rawSnippet.slice(0, 220),
    scaleApplied: best.candidate.scaleApplied,
    confidence:
      best.label.priority >= 90 && best.candidate.hasCurrency
        ? 'HIGH'
        : best.candidate.hasCurrency
          ? 'MEDIUM'
          : 'LOW',
  };
}
