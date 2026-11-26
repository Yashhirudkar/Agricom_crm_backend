import {
  evaluateFreightRequired,
  lookupFreightMatrix,
  FreightRuleEngineService,
  FREIGHT_COMPATIBILITY_MATRIX,
  SUPPORTED_INCOTERMS,
} from './freight-rule-engine.service';

describe('Freight Compatibility Matrix Rule Engine', () => {
  let service: FreightRuleEngineService;

  beforeEach(() => {
    service = new FreightRuleEngineService();
  });

  const EXW = { code: 'EXW', name: 'Ex Works' };
  const FCA = { code: 'FCA', name: 'Free Carrier' };
  const FAS = { code: 'FAS', name: 'Free Alongside Ship' };
  const FOB = { code: 'FOB', name: 'Free On Board' };
  const CFR = { code: 'CFR', name: 'Cost and Freight' };
  const CIF = { code: 'CIF', name: 'Cost, Insurance and Freight' };
  const CPT = { code: 'CPT', name: 'Carriage Paid To' };
  const CIP = { code: 'CIP', name: 'Carriage and Insurance Paid To' };
  const DAP = { code: 'DAP', name: 'Delivered at Place' };
  const DPU = { code: 'DPU', name: 'Delivered at Place Unloaded' };
  const DDP = { code: 'DDP', name: 'Delivered Duty Paid' };

  describe('Current Bug & Same Incoterm Scenarios', () => {
    it('Current case: SC = FCA, PC = FCA -> Freight Required = NO', () => {
      const result = service.evaluate(FCA, FCA);
      expect(result.freightRequired).toBe(false);
      expect(result.salesIncoterm).toBe('FCA');
      expect(result.purchaseIncoterm).toBe('FCA');
    });

    it('SC = CIF, PC = CIF -> Freight Required = NO', () => {
      const result = service.evaluate(CIF, CIF);
      expect(result.freightRequired).toBe(false);
    });

    it('SC = DAP, PC = DAP -> Freight Required = NO', () => {
      const result = service.evaluate(DAP, DAP);
      expect(result.freightRequired).toBe(false);
    });

    it('SC = DDP, PC = DDP -> Freight Required = NO', () => {
      const result = service.evaluate(DDP, DDP);
      expect(result.freightRequired).toBe(false);
    });

    it('All same Incoterms (diagonal) return NO', () => {
      for (const term of SUPPORTED_INCOTERMS) {
        const res = service.evaluate({ code: term }, { code: term });
        expect(res.freightRequired).toBe(false);
      }
    });
  });

  describe('Complete Freight Compatibility Matrix Verification (11 x 11 Combinations)', () => {
    it('Exact lookup verification across all 121 combinations (with isolated CFR/CIF rule)', () => {
      for (const sc of SUPPORTED_INCOTERMS) {
        for (const pc of SUPPORTED_INCOTERMS) {
          const matrixExpected = FREIGHT_COMPATIBILITY_MATRIX[sc][pc];
          const expected =
            sc === 'CIF' && pc === 'CFR' ? false : matrixExpected;
          // evaluate(pc, sc) -> Row = sc, Col = pc
          const evalResult = service.evaluate({ code: pc }, { code: sc });
          expect(evalResult.freightRequired).toBe(expected);

          // Direct lookup helper stays 100% bound to FREIGHT_COMPATIBILITY_MATRIX
          const lookupResult = lookupFreightMatrix(sc, pc);
          expect(lookupResult).toBe(matrixExpected);
        }
      }
    });

    it('SC = FCA, PC = EXW -> Freight Required = YES', () => {
      const result = service.evaluate(EXW, FCA);
      expect(result.freightRequired).toBe(true);
    });

    it('SC = FAS, PC = FCA -> Freight Required = YES', () => {
      const result = service.evaluate(FCA, FAS);
      expect(result.freightRequired).toBe(true);
    });

    it('SC = FOB, PC = FAS -> Freight Required = YES', () => {
      const result = service.evaluate(FAS, FOB);
      expect(result.freightRequired).toBe(true);
    });

    it('SC = CIF, PC = CFR -> Freight Required = NO (both contracts already include freight)', () => {
      const result = service.evaluate(CFR, CIF);
      expect(result.freightRequired).toBe(false);
    });

    it('SC = DAP, PC = CIP -> Freight Required = YES', () => {
      const result = service.evaluate(CIP, DAP);
      expect(result.freightRequired).toBe(true);
    });

    it('SC = DDP, PC = DPU -> Freight Required = YES', () => {
      const result = service.evaluate(DPU, DDP);
      expect(result.freightRequired).toBe(true);
    });

    it('SC = EXW, PC = DDP -> Freight Required = NO', () => {
      const result = service.evaluate(DDP, EXW);
      expect(result.freightRequired).toBe(false);
    });

    it('SC = FOB, PC = CIF -> Freight Required = NO', () => {
      const result = service.evaluate(CIF, FOB);
      expect(result.freightRequired).toBe(false);
    });
  });

  describe('Aliases and String Formats', () => {
    it('Handles CNF as CFR', () => {
      // SC = DAP, PC = CNF -> YES
      expect(service.evaluate('CNF', 'DAP').freightRequired).toBe(true);
      // SC = CNF, PC = FOB -> YES
      expect(service.evaluate('FOB', 'CNF').freightRequired).toBe(true);
      // SC = CIF, PC = CNF -> NO (both contracts already include freight)
      expect(service.evaluate('CNF', 'CIF').freightRequired).toBe(false);
      // SC = CNF, PC = CNF -> NO
      expect(service.evaluate('CNF', 'CNF').freightRequired).toBe(false);
    });

    it('Handles full names like "FCA - Free Carrier"', () => {
      const res = service.evaluate(
        { name: 'EXW - Ex Works' },
        { name: 'FCA - Free Carrier' },
      );
      expect(res.freightRequired).toBe(true);
      expect(res.salesIncoterm).toBe('FCA');
      expect(res.purchaseIncoterm).toBe('EXW');
    });

    it('Handles DAT as DPU', () => {
      // SC = DAT, PC = DAT -> NO
      expect(service.evaluate('DAT', 'DAT').freightRequired).toBe(false);
      // SC = DDP, PC = DAT -> YES
      expect(service.evaluate('DAT', 'DDP').freightRequired).toBe(true);
    });
  });

  describe('Enquiry Flow (Standalone SC Incoterm when PC is missing)', () => {
    it('SC = DAP, PC = null -> Freight Required = YES', () => {
      const result = service.evaluate(null, DAP);
      expect(result.freightRequired).toBe(true);
      expect(result.salesIncoterm).toBe('DAP');
    });

    it('SC = CIF, PC = null -> Freight Required = YES', () => {
      const result = service.evaluate(null, CIF);
      expect(result.freightRequired).toBe(true);
      expect(result.salesIncoterm).toBe('CIF');
    });

    it('SC = DDP, PC = null -> Freight Required = YES', () => {
      const result = service.evaluate(null, DDP);
      expect(result.freightRequired).toBe(true);
      expect(result.salesIncoterm).toBe('DDP');
    });

    it('SC = CFR, PC = null -> Freight Required = YES', () => {
      const result = service.evaluate(null, CFR);
      expect(result.freightRequired).toBe(true);
      expect(result.salesIncoterm).toBe('CFR');
    });

    it('SC = EXW, PC = null -> Freight Required = NO', () => {
      const result = service.evaluate(null, EXW);
      expect(result.freightRequired).toBe(false);
      expect(result.salesIncoterm).toBe('EXW');
    });

    it('SC = FCA, PC = null -> Freight Required = NO', () => {
      const result = service.evaluate(null, FCA);
      expect(result.freightRequired).toBe(false);
      expect(result.salesIncoterm).toBe('FCA');
    });

    it('SC = FOB, PC = null -> Freight Required = NO', () => {
      const result = service.evaluate(null, FOB);
      expect(result.freightRequired).toBe(false);
      expect(result.salesIncoterm).toBe('FOB');
    });

    it('SC = FAS, PC = null -> Freight Required = NO', () => {
      const result = service.evaluate(null, FAS);
      expect(result.freightRequired).toBe(false);
      expect(result.salesIncoterm).toBe('FAS');
    });
  });

  describe('Null and Edge Cases', () => {
    it('Neither SC nor PC defined -> Freight Required = NO', () => {
      const result = service.evaluate(null, null);
      expect(result.freightRequired).toBe(false);
    });

    it('PC defined, SC not defined -> Freight Required = NO', () => {
      const result = service.evaluate(FOB, null);
      expect(result.freightRequired).toBe(false);
    });

    it('does not derive Freight Required from numeric IDs or sequence metadata', () => {
      expect(service.evaluate(2, 4).freightRequired).toBe(false);
      expect(
        service.evaluate(
          { code: 'CUSTOM-SC', sequence: 4 } as any,
          { code: 'CUSTOM-PC', sequence: 2 } as any,
        ).freightRequired,
      ).toBe(false);
    });
  });

  describe('Both Contracts Include Freight (CFR / CNF / CIF Rule)', () => {
    it('returns Freight Required = false when both Purchase and Sales Incoterms are CFR/CNF/CIF', () => {
      const pairs: Array<[string, string]> = [
        ['CFR', 'CIF'],
        ['CIF', 'CFR'],
        ['CFR', 'CFR'],
        ['CIF', 'CIF'],
        ['CNF', 'CIF'],
        ['CIF', 'CNF'],
        ['CNF', 'CNF'],
        ['CNF', 'CFR'],
        ['CFR', 'CNF'],
      ];

      for (const [pc, sc] of pairs) {
        const result = evaluateFreightRequired(pc, sc);
        expect(result.freightRequired).toBe(false);
        expect(result.matrixResult).toBe(false);
      }
    });

    it('keeps standalone Enquiry flow and all non-CFR/CIF combinations unchanged', () => {
      expect(evaluateFreightRequired(null, 'CIF').freightRequired).toBe(true);
      expect(evaluateFreightRequired(null, 'CFR').freightRequired).toBe(true);
      expect(evaluateFreightRequired(null, 'CNF').freightRequired).toBe(true);
      expect(evaluateFreightRequired('CFR', 'DAP').freightRequired).toBe(true);
      expect(evaluateFreightRequired('CIF', 'DDP').freightRequired).toBe(true);
      expect(evaluateFreightRequired('FOB', 'CIF').freightRequired).toBe(true);
      expect(evaluateFreightRequired('FOB', 'CFR').freightRequired).toBe(true);
      expect(evaluateFreightRequired('CIF', 'FOB').freightRequired).toBe(false);
    });
  });
});
