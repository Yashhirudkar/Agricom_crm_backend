export interface FormatBankDetailsParams {
  currency: string;
  beneficiaryName?: string;
  domesticBank: {
    bankName: string;
    accountNumber: string;
    swiftCode: string;
    bankAddress?: string;
  };
  nostroBank?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    swiftCode: string;
    bankAddress?: string;
  } | null;
}

/**
 * Helper to format multi-line address fields with proper indentation aligning to the colon.
 */
export function formatAddressField(
  address?: string | null,
  label: string = 'Address',
  padLength: number = 16,
): string {
  if (!address || !address.trim()) return '';
  const lines = address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  if (lines.length === 1) {
    return `${label.padEnd(padLength, ' ')} : ${lines[0]}`;
  }

  return `${label.padEnd(padLength, ' ')} :\n${lines.join('\n')}`;
}

export function formatBankDetails(params: FormatBankDetailsParams): string {
  const currency = (params.currency || 'INR').toUpperCase().trim();
  const beneficiaryName = params.beneficiaryName || 'Agricom Impex Private Limited';
  const domestic = params.domesticBank;
  const nostro = params.nostroBank;

  const isDomesticOnly = currency === 'INR' || !nostro;
  const domesticAddrBlock = formatAddressField(domestic?.bankAddress, 'Address', 16);

  const divider = '========================================';

  if (isDomesticOnly) {
    const lines = [
      `BANK DETAILS (${currency})`,
      divider,
      'BENEFICIARY BANK DETAILS',
      `Beneficiary Name : ${beneficiaryName}`,
      `Bank Name        : ${domestic?.bankName || ''}`,
      `Account Number   : ${domestic?.accountNumber || ''}`,
      `SWIFT Code       : ${domestic?.swiftCode || ''}`,
    ];
    if (domesticAddrBlock) {
      lines.push(domesticAddrBlock);
    }
    return lines.join('\n');
  }

  const nostroAddr =
    nostro.bankAddress ||
    (nostro as any).address ||
    (nostro as any).nostroBankAddress ||
    '';

  const nostroAddrBlock = formatAddressField(nostroAddr, 'Address', 14);

  const lines = [
    `BANK DETAILS (${currency})`,
    divider,
    'NOSTRO BANK DETAILS',
    `Bank Name      : ${nostro.bankName || ''}`,
    `Account Name   : ${nostro.accountName || ''}`,
    `Account Number : ${nostro.accountNumber || ''}`,
    `SWIFT Code     : ${nostro.swiftCode || ''}`,
  ];

  if (nostroAddrBlock) {
    lines.push(nostroAddrBlock);
  }

  lines.push(
    '',
    divider,
    'BENEFICIARY BANK DETAILS',
    `Beneficiary Name : ${beneficiaryName}`,
    `Bank Name        : ${domestic?.bankName || ''}`,
    `Account Number   : ${domestic?.accountNumber || ''}`,
    `SWIFT Code       : ${domestic?.swiftCode || ''}`,
  );

  if (domesticAddrBlock) {
    lines.push(domesticAddrBlock);
  }

  return lines.join('\n');
}
