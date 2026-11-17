import {
  evaluateFreightRequired,
  FreightRuleEngineService,
} from './freight-rule-engine.service';

describe('Dynamic Freight Rule Engine', () => {
  let service: FreightRuleEngineService;

  beforeEach(() => {
    service = new FreightRuleEngineService();
  });

  const FCA = {
    code: 'FCA',
    name: 'Free Carrier',
    stageOrder: 1,
    locationType: 'Pickup Location',
    freightRequiredAfterStage: false,
  };

  const FOB = {
    code: 'FOB',
    name: 'Free On Board',
    stageOrder: 2,
    locationType: 'Port of Loading (POL)',
    freightRequiredAfterStage: false,
  };

  const CNF = {
    code: 'CNF',
    name: 'Cost and Freight',
    stageOrder: 3,
    locationType: 'Port of Destination (POD)',
    freightRequiredAfterStage: true,
  };

  const CIF = {
    code: 'CIF',
    name: 'Cost, Insurance and Freight',
    stageOrder: 3,
    locationType: 'Port of Destination (POD)',
    freightRequiredAfterStage: true,
  };

  const DAP = {
    code: 'DAP',
    name: 'Delivered at Place',
    stageOrder: 4,
    locationType: 'Final Destination',
    freightRequiredAfterStage: true,
  };

  const DDP = {
    code: 'DDP',
    name: 'Delivered Duty Paid',
    stageOrder: 5,
    locationType: 'Final Destination',
    freightRequiredAfterStage: true,
  };

  describe('Prompt Specification Scenarios', () => {
    it('Example 1: PC = FCA (Stage 1), SC = DAP (Stage 4) -> Freight Required = YES', () => {
      const result = service.evaluate(FCA, DAP);
      expect(result.freightRequired).toBe(true);
      expect(result.salesStage).toBe(4);
      expect(result.purchaseStage).toBe(1);
    });

    it('Example 2: PC = FCA, SC = FCA -> Freight Required = NO', () => {
      const result = service.evaluate(FCA, FCA);
      expect(result.freightRequired).toBe(false);
      expect(result.salesStage).toBe(1);
      expect(result.purchaseStage).toBe(1);
    });

    it('Example 3: PC = FOB, SC = FOB -> Freight Required = NO', () => {
      const result = service.evaluate(FOB, FOB);
      expect(result.freightRequired).toBe(false);
      expect(result.salesStage).toBe(2);
      expect(result.purchaseStage).toBe(2);
    });

    it('Example 4: PC = FOB, SC = CIF -> Freight Required = YES', () => {
      const result = service.evaluate(FOB, CIF);
      expect(result.freightRequired).toBe(true);
      expect(result.salesStage).toBe(3);
      expect(result.purchaseStage).toBe(2);
    });
  });

  describe('Additional Multi-Stage Scenarios', () => {
    it('PC = CIF (Stage 3), SC = CIF (Stage 3) -> Freight Required = NO', () => {
      const result = service.evaluate(CIF, CIF);
      expect(result.freightRequired).toBe(false);
    });

    it('PC = CIF (Stage 3), SC = DAP (Stage 4) -> Freight Required = YES', () => {
      const result = service.evaluate(CIF, DAP);
      expect(result.freightRequired).toBe(true);
    });

    it('PC = DAP (Stage 4), SC = FOB (Stage 2) -> Freight Required = NO (Sales stage < Purchase stage)', () => {
      const result = service.evaluate(DAP, FOB);
      expect(result.freightRequired).toBe(false);
    });

    it('PC = FOB (Stage 2), SC = CNF (Stage 3) -> Freight Required = YES', () => {
      const result = service.evaluate(FOB, CNF);
      expect(result.freightRequired).toBe(true);
    });

    it('PC = FCA (Stage 1), SC = DDP (Stage 5) -> Freight Required = YES', () => {
      const result = service.evaluate(FCA, DDP);
      expect(result.freightRequired).toBe(true);
    });

    it('Standalone SC = CIF without PC -> Freight Required = YES', () => {
      const result = service.evaluate(null, CIF);
      expect(result.freightRequired).toBe(true);
    });

    it('Standalone SC = FOB without PC -> Freight Required = NO', () => {
      const result = service.evaluate(null, FOB);
      expect(result.freightRequired).toBe(false);
    });
  });

  describe('Future-Proof (Zero hardcoded codes)', () => {
    it('Works dynamically with brand new custom shipment types (e.g. EXW Stage 1, CFR Stage 3)', () => {
      const CUSTOM_EXW = {
        code: 'CUSTOM_EXW',
        stageOrder: 1,
        locationType: 'Pickup Location',
        freightRequiredAfterStage: false,
      };
      const CUSTOM_CFR = {
        code: 'CUSTOM_CFR',
        stageOrder: 3,
        locationType: 'Port of Destination (POD)',
        freightRequiredAfterStage: true,
      };

      const result = evaluateFreightRequired(CUSTOM_EXW, CUSTOM_CFR);
      expect(result.freightRequired).toBe(true);
      expect(result.salesStage).toBe(3);
      expect(result.purchaseStage).toBe(1);
    });

    it('Works dynamically when a stage has freightRequiredAfterStage = false even if stage is higher', () => {
      const STAGE_1 = { stageOrder: 1, freightRequiredAfterStage: false };
      const STAGE_2_NO_FREIGHT = { stageOrder: 2, freightRequiredAfterStage: false };

      const result = evaluateFreightRequired(STAGE_1, STAGE_2_NO_FREIGHT);
      expect(result.freightRequired).toBe(false);
    });
  });
});

