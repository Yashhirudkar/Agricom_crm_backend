import { isFreightRequiredForIncoterm } from './incoterm-freight.util';

describe('isFreightRequiredForIncoterm', () => {
  it('evaluates standalone Incoterm correctly when the other contract Incoterm is missing (Enquiry Flow)', () => {
    expect(isFreightRequiredForIncoterm('CFR')).toBe(true);
    expect(isFreightRequiredForIncoterm('CIF')).toBe(true);
    expect(isFreightRequiredForIncoterm('DAP')).toBe(true);
    expect(isFreightRequiredForIncoterm('DDP')).toBe(true);
    expect(isFreightRequiredForIncoterm('EXW')).toBe(false);
    expect(isFreightRequiredForIncoterm('FCA')).toBe(false);
    expect(isFreightRequiredForIncoterm('FCA - Free Carrier')).toBe(false);
    expect(isFreightRequiredForIncoterm('FOB')).toBe(false);
    expect(isFreightRequiredForIncoterm('FAS')).toBe(false);
  });

  it('uses the SC-by-PC compatibility matrix when both terms are supplied', () => {
    expect(isFreightRequiredForIncoterm('FOB', 'EXW')).toBe(true);
    expect(isFreightRequiredForIncoterm('FCA', 'FCA')).toBe(false);
    expect(isFreightRequiredForIncoterm('CFR', 'CFR')).toBe(false);
    expect(isFreightRequiredForIncoterm('CIF', 'CFR')).toBe(false);
    expect(isFreightRequiredForIncoterm('CFR', 'CIF')).toBe(false);
    expect(isFreightRequiredForIncoterm('CIF', 'CIF')).toBe(false);
    expect(isFreightRequiredForIncoterm('CIF', 'CNF')).toBe(false);
    expect(isFreightRequiredForIncoterm('CNF', 'CIF')).toBe(false);
  });

  it('returns false for null, undefined or empty string', () => {
    expect(isFreightRequiredForIncoterm(null)).toBe(false);
    expect(isFreightRequiredForIncoterm(undefined)).toBe(false);
    expect(isFreightRequiredForIncoterm('')).toBe(false);
  });
});
