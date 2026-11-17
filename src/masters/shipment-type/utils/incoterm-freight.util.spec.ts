import { isFreightRequiredForIncoterm } from './incoterm-freight.util';

describe('isFreightRequiredForIncoterm', () => {
  it('returns false for EXW, FCA, FAS, FOB', () => {
    expect(isFreightRequiredForIncoterm('EXW')).toBe(false);
    expect(isFreightRequiredForIncoterm('exw')).toBe(false);
    expect(isFreightRequiredForIncoterm('EXW - Ex Works')).toBe(false);

    expect(isFreightRequiredForIncoterm('FCA')).toBe(false);
    expect(isFreightRequiredForIncoterm('FCA - Free Carrier')).toBe(false);

    expect(isFreightRequiredForIncoterm('FAS')).toBe(false);
    expect(isFreightRequiredForIncoterm('FAS - Free Alongside Ship')).toBe(false);

    expect(isFreightRequiredForIncoterm('FOB')).toBe(false);
    expect(isFreightRequiredForIncoterm('fob')).toBe(false);
    expect(isFreightRequiredForIncoterm('FOB - Free on Board')).toBe(false);
  });

  it('returns true for CFR, CNF, CIF, CPT, CIP, DAP, DPU, DDP', () => {
    expect(isFreightRequiredForIncoterm('CFR')).toBe(true);
    expect(isFreightRequiredForIncoterm('cfr')).toBe(true);
    expect(isFreightRequiredForIncoterm('CFR (CNF)')).toBe(true);
    expect(isFreightRequiredForIncoterm('CNF')).toBe(true);

    expect(isFreightRequiredForIncoterm('CIF')).toBe(true);
    expect(isFreightRequiredForIncoterm('cif')).toBe(true);
    expect(isFreightRequiredForIncoterm('CIF - Cost, Insurance, and Freight')).toBe(true);

    expect(isFreightRequiredForIncoterm('CPT')).toBe(true);
    expect(isFreightRequiredForIncoterm('CIP')).toBe(true);
    expect(isFreightRequiredForIncoterm('DAP')).toBe(true);
    expect(isFreightRequiredForIncoterm('DPU')).toBe(true);
    expect(isFreightRequiredForIncoterm('DDP')).toBe(true);
  });

  it('returns false for null, undefined or empty string', () => {
    expect(isFreightRequiredForIncoterm(null)).toBe(false);
    expect(isFreightRequiredForIncoterm(undefined)).toBe(false);
    expect(isFreightRequiredForIncoterm('')).toBe(false);
  });
});
