import { BadRequestException } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Seller configuration map.
 *
 * sellerCode  — the fixed seller contribution to the prefix.
 * initialSequence — the starting sequence when no contracts exist yet.
 *
 * PREFIX FORMULA:
 *   <BuyerFirstInitial> + <sellerCode>
 *
 * AGRICOM IMPEX      → sellerCode = "A"
 *   Buyer = BAK-ROL  → prefix "BA"
 *   Buyer = HORIZON  → prefix "HA"
 *   Buyer = EQUAL    → prefix "EA"
 *
 * AGRICOM IMPEX PVT LTD → sellerCode = "AGPL"
 *   Buyer = AAGMAN   → prefix "AAGPL"
 *   Buyer = HORIZON  → prefix "HAGPL"
 *   Buyer = EQUAL    → prefix "EAGPL"
 *
 * The SEQUENCE is shared across ALL buyers for the same seller + FY.
 * Buyer initial only affects the prefix, NEVER the sequence lookup.
 */
const SELLER_CONFIG_MAP: Record<
  string,
  { sellerCode: string; initialSequence: number; includeBuyerInitial: boolean }
> = {
  'AGRICOM IMPEX': {
    sellerCode: 'A',
    initialSequence: 1,
    includeBuyerInitial: true,
  },
  'AGRICOM IMPEX PVT LTD': {
    sellerCode: 'AGPL',
    initialSequence: 1501,
    includeBuyerInitial: false,
  },
};

/**
 * Determine if a seller qualifies for auto-generated contract numbers.
 * Returns the seller config if yes, undefined otherwise.
 */
export function getAutoContractConfig(sellerName: string):
  | {
      sellerCode: string;
      initialSequence: number;
      includeBuyerInitial: boolean;
    }
  | undefined {
  if (!sellerName) return undefined;
  const normalized = sellerName.trim().toUpperCase();
  return SELLER_CONFIG_MAP[normalized];
}

/**
 * Extract the buyer's first meaningful initial (first character of entity name, uppercased).
 */
export function getBuyerInitial(buyerName: string): string {
  if (!buyerName || !buyerName.trim()) {
    throw new BadRequestException(
      'Buyer name is required for contract number generation.',
    );
  }
  return buyerName.trim().toUpperCase()[0];
}

/**
 * Build the full prefix from buyer name + seller code.
 *
 * Examples:
 *   buyer="BAK-ROL SP. Z O.O", sellerCode="A"    → "BA"
 *   buyer="HORIZON TRADING",   sellerCode="A"    → "HA"
 *   buyer="EQUAL AGRO",        sellerCode="AGPL" → "EAGPL"
 *   buyer="HORIZON TRADING",   sellerCode="AGPL" → "HAGPL"
 */
export function buildContractPrefix(
  buyerName: string,
  sellerCode: string,
  includeBuyerInitial: boolean,
): string {
  if (includeBuyerInitial) {
    return getBuyerInitial(buyerName) + sellerCode.toUpperCase();
  }
  return sellerCode.toUpperCase();
}

/**
 * Derive the 4-digit financial year suffix from a FY string like "2026-2027" → "2627".
 */
export function getFySuffix(financialYear: string): string {
  if (!financialYear || !/^\d{4}-\d{4}$/.test(financialYear)) {
    throw new BadRequestException(
      `Invalid financial year format: "${financialYear}". Expected YYYY-YYYY.`,
    );
  }
  const [startYear, endYear] = financialYear.split('-');
  return startYear.slice(2) + endYear.slice(2);
}

/**
 * Parse the running sequence from an existing contract number.
 *
 * The sequence is shared across ALL buyers for the same seller + FY.
 * Because the buyer initial differs per contract, we match by sellerCode pattern,
 * not a fixed full prefix.
 *
 * Supported formats (prefix = <anyBuyerInitial><sellerCode>):
 *   BA.1872627     → sellerCode="A",    fySuffix="2627"  → sequence=187
 *   HA.1912627     → sellerCode="A",    fySuffix="2627"  → sequence=191
 *   AAGPL15012627  → sellerCode="AGPL", fySuffix="2627"  → sequence=1501
 *   HAGPL.15052627 → sellerCode="AGPL", fySuffix="2627"  → sequence=1505
 *
 * Pattern matched (case-insensitive):
 *   ^[A-Z]<SELLERCODE>\.?(\d+)<FYSUFFIX>$
 *
 * Returns the numeric sequence, or null if parsing fails.
 */
export function parseSequenceFromContractNumber(
  contractNumber: string,
  sellerCode: string,
  fySuffix: string,
  includeBuyerInitial: boolean,
): number | null {
  if (!contractNumber) return null;

  const upper = contractNumber.trim().toUpperCase();
  const scUpper = sellerCode.toUpperCase();

  // Regex: optional buyer-initial letter (if includeBuyerInitial) + sellerCode + optional dot + digits + fySuffix
  // We use ^ and $ to ensure exact match.
  const prefixPattern = includeBuyerInitial
    ? `^[A-Z]${scUpper}`
    : `^${scUpper}`;
  const pattern = new RegExp(`${prefixPattern}\\.?(\\d+)${fySuffix}$`);
  const match = upper.match(pattern);
  if (!match) return null;

  const seq = parseInt(match[1], 10);
  return isNaN(seq) ? null : seq;
}

/**
 * Atomically generate the next contract number for an Agricom seller.
 *
 * CONTRACT NUMBER FORMAT:  <BuyerInitial><SellerCode>.<sequence><fySuffix>
 *
 * Algorithm:
 *  1. Inside the caller's transaction, lock all existing contracts for seller + FY
 *     with FOR UPDATE (prevents parallel inserts from picking same sequence).
 *  2. Parse each contract number using sellerCode pattern to extract the sequence.
 *  3. Find MAX sequence across ALL buyers (sequence is seller-wide, not buyer-specific).
 *  4. Next sequence = MAX + 4   (or initialSequence if no contracts yet).
 *  5. Build final number = <buyerInitial><sellerCode>.<nextSequence><fySuffix>
 *
 * MUST be called inside an active Sequelize transaction.
 */
export async function generateNextContractNumber(opts: {
  sequelize: Sequelize;
  sellerId: number;
  sellerName: string;
  buyerName: string;
  financialYear: string;
  transaction: Transaction;
}): Promise<string> {
  const {
    sequelize,
    sellerId,
    sellerName,
    buyerName,
    financialYear,
    transaction,
  } = opts;

  const config = getAutoContractConfig(sellerName);
  if (!config) {
    throw new BadRequestException(
      `Seller "${sellerName}" is not configured for auto contract number generation.`,
    );
  }

  const { sellerCode, initialSequence, includeBuyerInitial } = config;
  const fySuffix = getFySuffix(financialYear);

  // Lock all existing contracts for this seller + FY to prevent race conditions.
  // FOR UPDATE ensures no parallel transaction can insert/modify these rows
  // until this transaction commits, guaranteeing unique sequence generation.
  const rows = await sequelize.query<{ contract_number: string }>(
    `SELECT contract_number
     FROM sales_contracts
     WHERE seller_id = :sellerId
       AND financial_year = :financialYear
       AND contract_number IS NOT NULL
     FOR UPDATE`,
    {
      replacements: { sellerId, financialYear },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  // Parse sequences from all existing contract numbers for this seller + FY.
  // Buyer initial varies per row but sequence is seller-wide — we match by sellerCode pattern.
  let maxSequence: number | null = null;
  for (const row of rows) {
    const seq = parseSequenceFromContractNumber(
      row.contract_number,
      sellerCode,
      fySuffix,
      includeBuyerInitial,
    );
    if (seq !== null && (maxSequence === null || seq > maxSequence)) {
      maxSequence = seq;
    }
  }

  // Determine next sequence (seller-wide)
  const nextSequence = maxSequence !== null ? maxSequence + 4 : initialSequence;

  // Build prefix from buyer initial + seller code
  const prefix = buildContractPrefix(
    buyerName,
    sellerCode,
    includeBuyerInitial,
  );

  // Final contract number format: <prefix>.<sequence><fySuffix>
  return `${prefix}.${nextSequence}${fySuffix}`;
}
