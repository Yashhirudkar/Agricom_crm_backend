import { isFreightRequiredForIncoterm } from './incoterm-freight.util';

describe('isFreightRequiredForIncoterm', () => {
  it('returns NO when the other contract Incoterm is missing', () => {
    expect(isFreightRequiredForIncoterm('CFR')).toBe(false);
    expect(isFreightRequiredForIncoterm('FCA - Free Carrier')).toBe(false);
  });

  it('uses the SC-by-PC compatibility matrix when both terms are supplied', () => {
    expect(isFreightRequiredForIncoterm('FOB', 'EXW')).toBe(true);
    expect(isFreightRequiredForIncoterm('FCA', 'FCA')).toBe(false);
    expect(isFreightRequiredForIncoterm('CFR', 'CFR')).toBe(false);
  });

  it('returns false for null, undefined or empty string', () => {
    expect(isFreightRequiredForIncoterm(null)).toBe(false);
    expect(isFreightRequiredForIncoterm(undefined)).toBe(false);
    expect(isFreightRequiredForIncoterm('')).toBe(false);
  });
});
