/**
 * Converts a numeric amount to English words for financial export invoices.
 * Supports international currencies (USD, EUR, GBP, KZT, etc.) and Indian Rupee (INR).
 */
export function convertAmountToWords(amount: number | string, currency: string = 'USD'): string {
  const num = parseFloat(String(amount || 0));
  const curr = (currency || 'USD').toUpperCase().trim();

  if (isNaN(num) || num === 0) {
    return `${curr} ZERO ONLY`;
  }

  const ones = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
    'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
  ];

  const tens = [
    '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY',
  ];

  const convertChunk = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convertChunk(n % 100) : '');
    return '';
  };

  const absNum = Math.abs(num);
  const wholePart = Math.floor(absNum);
  const decimalPart = Math.round((absNum - wholePart) * 100);

  let words = '';

  if (curr === 'INR') {
    let n = wholePart;
    if (n === 0) {
      words = 'ZERO';
    } else {
      const crore = Math.floor(n / 10000000);
      n %= 10000000;
      const lakh = Math.floor(n / 100000);
      n %= 100000;
      const thousand = Math.floor(n / 1000);
      n %= 1000;

      if (crore > 0) words += convertChunk(crore) + ' CRORE ';
      if (lakh > 0) words += convertChunk(lakh) + ' LAKH ';
      if (thousand > 0) words += convertChunk(thousand) + ' THOUSAND ';
      if (n > 0) words += convertChunk(n);
    }
  } else {
    let n = wholePart;
    if (n === 0) {
      words = 'ZERO';
    } else {
      const billion = Math.floor(n / 1000000000);
      n %= 1000000000;
      const million = Math.floor(n / 1000000);
      n %= 1000000;
      const thousand = Math.floor(n / 1000);
      n %= 1000;

      if (billion > 0) words += convertChunk(billion) + ' BILLION ';
      if (million > 0) words += convertChunk(million) + ' MILLION ';
      if (thousand > 0) words += convertChunk(thousand) + ' THOUSAND ';
      if (n > 0) words += convertChunk(n);
    }
  }

  words = words.trim();

  let currencyName = curr;
  let subUnit = 'CENTS';

  if (curr === 'USD') {
    currencyName = 'USD';
    subUnit = 'CENTS';
  } else if (curr === 'EUR' || curr === 'EURO') {
    currencyName = 'EURO';
    subUnit = 'CENTS';
  } else if (curr === 'INR') {
    currencyName = 'INR';
    subUnit = 'PAISE';
  } else if (curr === 'GBP') {
    currencyName = 'GBP';
    subUnit = 'PENCE';
  } else if (curr === 'KZT') {
    currencyName = 'KZT';
    subUnit = 'TIYN';
  }

  if (decimalPart > 0) {
    const decimalWords = convertChunk(decimalPart);
    return `${currencyName} ${words} AND ${subUnit} ${decimalWords} ONLY`;
  }

  return `${currencyName} ${words} ONLY`;
}

