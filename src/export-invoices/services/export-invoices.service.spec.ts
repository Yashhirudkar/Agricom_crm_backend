import { ExportInvoicesService } from './export-invoices.service';

describe('ExportInvoicesService - Single vs Combined Group Invoice', () => {
  let service: ExportInvoicesService;
  let mockInvoiceModel: any;
  let mockShipmentModel: any;
  let mockContractModel: any;
  let mockStuffingModel: any;
  let mockPurchaseContractModel: any;
  let mockBankProvider: any;
  let mockInvoiceNumberService: any;
  let mockSignatureProvider: any;
  let mockStuffingGroupModel: any;
  let mockStuffingGroupItemModel: any;
  let mockInvoiceStuffingGroupModel: any;

  const buildShipment = (
    id: number,
    ref: string,
    qty: number,
    truckNo: string,
    overrides: any = {},
  ) => ({
    id,
    companyId: 1,
    salesContractId: 50,
    shipmentReference: ref,
    quantity: qty,
    noOfContainers: 1,
    ratePerMt: 12121,
    businessTransaction: { id: 10, businessReference: 'REF-000001' },
    company: { id: 1, name: 'AGRICOM IMPEX' },
    salesContract: {
      id: 50,
      companyId: 1,
      contractNumber: '00125',
      contractDate: '2026-08-01',
      currencyCode: 'USD',
      originCountry: 'Kazakhstan',
      destinationCountry: 'UAE',
      originTransportMode: 'sea',
      containerType: '40 FT',
      buyer: { entityName: 'Buyer Corp', address: 'Dubai' },
      seller: { entityName: 'Seller Corp', country: 'India' },
      paymentTerm: { name: '100% CAD' },
      shipmentType: { code: 'CIF' },
      items: [
        {
          id: 90,
          productId: 1,
          bagTypeId: 10,
          packingTypeId: 3,
          containerType: '20 FT',
          unitPrice: 12121,
          marking: '',
          origin: 'KAZAKHSTAN',
          quantity: 44,
          product: { id: 1, name: 'BLACK MILLET' },
          bagType: { id: 10, name: 'NEW JUTE BAG WITH INNER' },
          packingType: { id: 3, name: '15 KG' },
          bagSpecification: {},
        },
      ],
    },
    stuffingExecution: {
      id: 200 + id,
      shipmentId: id,
      trucks: truckNo ? [{ truckNo }] : [],
      containers: [{ containerNo: `CONT-${id}` }],
    },
    ...overrides,
  });

  beforeEach(() => {
    mockInvoiceModel = {
      create: jest.fn().mockImplementation((payload: any) =>
        Promise.resolve({ id: 501, ...payload }),
      ),
      findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
      findByPk: jest.fn().mockResolvedValue(null),
    };
    mockShipmentModel = {
      findByPk: jest.fn(),
      findAll: jest.fn(),
    };
    mockContractModel = { findByPk: jest.fn(), findAll: jest.fn() };
    mockStuffingModel = { findOne: jest.fn(), findAll: jest.fn() };
    mockPurchaseContractModel = {
      findByPk: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
    };
    mockBankProvider = {
      getAvailableBanks: jest
        .fn()
        .mockResolvedValue([{ key: 'USD', details: { bankName: 'Test Bank' } }]),
    };
    mockInvoiceNumberService = {
      previewNextNumber: jest.fn().mockResolvedValue({
        invoiceNumber: 'EXP-001-00125',
        sequenceNumber: 1,
        isManualFirstSequence: false,
      }),
      consumeNextNumber: jest.fn().mockResolvedValue({
        invoiceNumber: 'EXP-001-00125',
        sequenceNumber: 1,
      }),
    };
    mockSignatureProvider = {
      getSignaturesForCompany: jest.fn().mockResolvedValue({}),
    };
    mockStuffingGroupModel = { findByPk: jest.fn() };
    mockStuffingGroupItemModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockInvoiceStuffingGroupModel = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 88 }),
    };

    service = new ExportInvoicesService(
      mockInvoiceModel,
      mockShipmentModel,
      mockContractModel,
      mockStuffingModel,
      mockPurchaseContractModel,
      mockBankProvider,
      mockInvoiceNumberService,
      mockSignatureProvider,
      mockStuffingGroupModel,
      mockStuffingGroupItemModel,
      mockInvoiceStuffingGroupModel,
    );
  });

  it('keeps single-shipment initFromShipment untouched and single-row', async () => {
    const sh1 = buildShipment(21, '00125/1/C1/AUG/26', 22, 'TRK-1');
    mockShipmentModel.findByPk.mockResolvedValue(sh1);

    const res: any = await service.initFromShipment(21, { companyId: 1 });

    expect(res.shipmentId).toBe(21);
    expect(res.isMultiShipment).toBeUndefined();
    expect(res.stuffingGroupId).toBeUndefined();
    expect(res.goodsItems).toHaveLength(1);
    expect(res.goodsItems[0].containerNo).toBe('CONT-21');
    expect(res.totalQuantity).toBe(22);
    expect(res.totalAmount).toBe(266662);
  });

  it('merges combined identical shipments into one aggregated Goods row with exact Packages and Description formulas', async () => {
    const sh1 = buildShipment(21, '00125/1/C1/AUG/26', 22, '');
    const sh2 = buildShipment(22, '00125/2/C1/AUG/26', 22, '');
    mockStuffingGroupModel.findByPk.mockResolvedValue({
      id: 77,
      groupReference: 'SEG-00125-21',
      transportCategory: 'sea',
      items: [
        { sequenceOrder: 1, shipment: sh1, shipmentStuffing: sh1.stuffingExecution },
        { sequenceOrder: 2, shipment: sh2, shipmentStuffing: sh2.stuffingExecution },
      ],
    });

    const res: any = await service.initFromStuffingGroup(77, { companyId: 1 });

    expect(res.isMultiShipment).toBe(true);
    expect(res.stuffingGroupId).toBe(77);
    expect(res.shipmentIds).toEqual([21, 22]);
    expect(res.goodsItems).toHaveLength(1);
    expect(res.goodsItems[0]).toMatchObject({
      containerNo: '',
      noAndKindOfPackages: '880 BAGS\nPACKING:\nNEW JUTE BAG WITH INNER\nOF 15 KG EACH',
      descriptionOfGoods: '2 × 20 FT CONTAINERS\nOF\nBLACK MILLET',
      marksAndNos: '',
      quantity: 44,
      rate: 12121,
      amount: 533324,
      shipmentReferences: ['00125/1/C1/AUG/26', '00125/2/C1/AUG/26'],
    });
    expect(res.totalQuantity).toBe(44);
    expect(res.totalAmount).toBe(533324);

    // When Sales Contract item has marking, populate Marks & Nos. with only that marking
    sh1.salesContract.items[0].marking = 'Agricom Brand 15 Kg';
    const resWithMarking: any = await service.initFromStuffingGroup(77, { companyId: 1 });
    expect(resWithMarking.goodsItems[0].marksAndNos).toBe('AGRICOM BRAND 15 KG');
  });

  it('splits Goods rows only when commercial values or item attributes differ', async () => {
    const sh1 = buildShipment(21, '00125/1/C1/AUG/26', 22, '', { ratePerMt: 500 });
    const sh2 = buildShipment(22, '00125/2/C1/AUG/26', 22, '', { ratePerMt: 550 });
    mockStuffingGroupModel.findByPk.mockResolvedValue({
      id: 78,
      groupReference: 'SEG-00125-21',
      transportCategory: 'sea',
      items: [
        { sequenceOrder: 1, shipment: sh1, shipmentStuffing: sh1.stuffingExecution },
        { sequenceOrder: 2, shipment: sh2, shipmentStuffing: sh2.stuffingExecution },
      ],
    });

    const resRateSplit: any = await service.initFromStuffingGroup(78, { companyId: 1 });
    expect(resRateSplit.goodsItems).toHaveLength(2);
    expect(resRateSplit.goodsItems[0].rate).toBe(500);
    expect(resRateSplit.goodsItems[1].rate).toBe(550);
    expect(resRateSplit.totalQuantity).toBe(44);

    // Distinct contract items (different product & packing) also remain separate rows
    const shA = buildShipment(31, '00125/1/C1/AUG/26', 22, '');
    const shB = buildShipment(32, '00125/2/C1/AUG/26', 22, '');
    shA.salesContract.items = [
      {
        id: 91,
        productId: 1,
        bagTypeId: 10,
        packingTypeId: 3,
        containerType: '20 FT',
        unitPrice: 500,
        quantity: 22,
        product: { id: 1, name: 'BLACK MILLET' },
        bagType: { id: 10, name: 'NEW JUTE BAG WITH INNER' },
        packingType: { id: 3, name: '15 KG' },
      },
      {
        id: 92,
        productId: 2,
        bagTypeId: 5,
        packingTypeId: 5,
        containerType: '40 FT',
        unitPrice: 600,
        quantity: 22,
        product: { id: 2, name: 'WHITE MUSTARD' },
        bagType: { id: 5, name: 'NEW PP BAGS' },
        packingType: { id: 5, name: '25 KG' },
      },
    ];
    shB.salesContract = shA.salesContract;
    mockShipmentModel.findAll.mockResolvedValue([shA, shB]);

    const resItemSplit: any = await service.initFromMultiShipments('31,32', { companyId: 1 });
    expect(resItemSplit.goodsItems).toHaveLength(2);
    expect(resItemSplit.goodsItems[0].descriptionOfGoods).toContain('20 FT');
    expect(resItemSplit.goodsItems[0].descriptionOfGoods).toContain('BLACK MILLET');
    expect(resItemSplit.goodsItems[1].descriptionOfGoods).toContain('40 FT');
    expect(resItemSplit.goodsItems[1].descriptionOfGoods).toContain('WHITE MUSTARD');
    expect(resItemSplit.totalQuantity).toBe(44);
  });

  it('returns existingInvoiceId when StuffingExecutionGroup already has an Export Invoice and blocks duplicates', async () => {
    const sh1 = buildShipment(21, '00125/1/C1/AUG/26', 22, '');
    const sh2 = buildShipment(22, '00125/2/C1/AUG/26', 22, '');
    mockStuffingGroupModel.findByPk.mockResolvedValue({
      id: 77,
      groupReference: 'SEG-00125-21',
      transportCategory: 'sea',
      items: [
        { sequenceOrder: 1, shipment: sh1, shipmentStuffing: sh1.stuffingExecution },
        { sequenceOrder: 2, shipment: sh2, shipmentStuffing: sh2.stuffingExecution },
      ],
    });
    mockInvoiceStuffingGroupModel.findAll.mockResolvedValue([
      { exportInvoiceId: 999, stuffingGroupId: 77 },
    ]);
    mockInvoiceModel.findByPk.mockResolvedValue({
      id: 999,
      invoiceNumber: 'EXP-010-00125',
    });

    const initRes: any = await service.initFromStuffingGroup(77, { companyId: 1 });
    expect(initRes).toMatchObject({
      existingInvoiceId: 999,
      existingInvoiceNumber: 'EXP-010-00125',
      isMultiShipment: true,
      stuffingGroupId: 77,
    });

    await expect(
      service.create(
        {
          salesContractId: 50,
          shipmentId: 21,
          stuffingGroupId: 77,
          shipmentIds: [21, 22],
          goodsItems: [],
        } as any,
        { id: 1, companyId: 1 },
      ),
    ).rejects.toThrow(
      'A combined Export Invoice (EXP-010-00125) already exists for Stuffing Execution Group #77.',
    );
  });

  it('rejects combined invoice init across different Sales Contracts', async () => {
    const sh1 = buildShipment(21, '00125/1/C1/AUG/26', 22, 'TRK-1');
    const sh2 = buildShipment(22, '00126/1/C1/AUG/26', 22, 'TRK-2');
    sh2.salesContractId = 99;
    mockShipmentModel.findAll.mockResolvedValue([sh1, sh2]);

    await expect(
      service.initFromMultiShipments('21,22', { companyId: 1 }),
    ).rejects.toThrow(
      'Combined Export Invoice is allowed only for shipments belonging to the same Sales Contract.',
    );
  });

  it('creates ExportInvoiceStuffingGroup link only for multi-shipment invoices', async () => {
    await service.create(
      {
        salesContractId: 50,
        shipmentId: 21,
        goodsItems: [
          {
            marksAndNos: 'M1',
            containerNo: 'C1',
            noAndKindOfPackages: '440 BAGS',
            descriptionOfGoods: 'BLACK MILLET',
            quantity: 22,
            rate: 500,
            amount: 11000,
          },
        ],
      } as any,
      { id: 1, companyId: 1 },
    );
    expect(mockInvoiceStuffingGroupModel.create).not.toHaveBeenCalled();

    await service.create(
      {
        salesContractId: 50,
        shipmentId: 21,
        stuffingGroupId: 77,
        shipmentIds: [21, 22],
        goodsItems: [
          {
            shipmentId: 21,
            shipmentReference: '00125/1/C1/AUG/26, 00125/2/C1/AUG/26',
            shipmentReferences: ['00125/1/C1/AUG/26', '00125/2/C1/AUG/26'],
            marksAndNos: '00125/1/C1/AUG/26\n00125/2/C1/AUG/26',
            containerNo: '',
            noAndKindOfPackages: '880 BAGS\nPACKING:\nNEW JUTE BAG WITH INNER\nOF 15 KG EACH',
            descriptionOfGoods: '2 × 20 FT CONTAINERS\nOF\nBLACK MILLET',
            quantity: 44,
            rate: 500,
            amount: 22000,
          },
        ],
      } as any,
      { id: 1, companyId: 1 },
    );
    expect(mockInvoiceStuffingGroupModel.create).toHaveBeenCalledWith({
      exportInvoiceId: 501,
      stuffingGroupId: 77,
      shipmentIds: [21, 22],
    });
  });
});
