/// <reference types="jest" />

import { BadRequestException } from '@nestjs/common';
import { SalesContractService } from './sales-contract.service';
import { Partner } from '../masters/partner/partner.model';
import { ShipmentType } from '../masters/shipment-type/shipment-type.model';
import { PaymentTerm } from '../masters/payment-term/payment-term.model';
import { Product } from '../masters/product/product.model';
import { BagType } from '../masters/bag-specs/models/bag-type.model';
import { PackingType } from '../masters/bag-specs/models/packing-type.model';
import { Enquiry } from '../enquiries/models/enquiry.model';

describe('SalesContractService - Rail Freight / Wagon divisibility exception', () => {
  let service: SalesContractService;
  let mockContractModel: any;
  let mockItemModel: any;
  let mockShipmentModel: any;
  let mockDocumentModel: any;
  let mockDocumentFileModel: any;
  let mockTransportDetailModel: any;
  let mockSequelize: any;

  beforeEach(() => {
    jest.spyOn(Partner, 'findOne').mockResolvedValue({ id: 1 } as any);
    jest.spyOn(ShipmentType, 'findOne').mockResolvedValue({
      id: 1,
      code: 'FCA',
      salesContractDeliveryPlaceRequired: true,
    } as any);
    jest.spyOn(PaymentTerm, 'findOne').mockResolvedValue({ id: 1 } as any);
    jest.spyOn(Product, 'findOne').mockResolvedValue({ id: 1 } as any);
    jest.spyOn(BagType, 'findOne').mockResolvedValue({ id: 1 } as any);
    jest.spyOn(PackingType, 'findOne').mockResolvedValue({ id: 1 } as any);

    mockContractModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (data: any) => ({
        id: 101,
        ...data,
      })),
    };
    mockItemModel = {
      bulkCreate: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 201 }),
    };
    mockShipmentModel = {
      bulkCreate: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 301 }),
      update: jest.fn().mockResolvedValue([1]),
    };
    mockDocumentModel = { bulkCreate: jest.fn(), findAll: jest.fn().mockResolvedValue([]) };
    mockDocumentFileModel = { findAll: jest.fn().mockResolvedValue([]) };
    mockTransportDetailModel = { bulkCreate: jest.fn(), destroy: jest.fn() };
    mockSequelize = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb({})),
      query: jest.fn().mockResolvedValue([]),
    };

    service = new SalesContractService(
      mockContractModel,
      mockItemModel,
      mockShipmentModel,
      mockDocumentModel,
      mockDocumentFileModel,
      mockTransportDetailModel,
      {} as any,
      mockSequelize,
      { ensureForSalesContract: jest.fn() } as any,
      undefined,
      undefined,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseDto = (mode: string, quantity: number, qtyPerCount: number, shipments: any[]) =>
    ({
      contractNumber: 'SC-RAIL-001',
      financialYear: '2026-2027',
      contractDate: '2026-11-26',
      buyerId: 1,
      sellerId: 1,
      shipmentTypeId: 1,
      paymentTermId: 1,
      originTransportMode: mode,
      destinationTransportMode: mode,
      status: 'Draft',
      items: [
        {
          productId: 1,
          bagTypeId: 1,
          packingTypeId: 1,
          quality: 'Standard',
          qtyPerCount,
          quantity,
          unitPrice: 500,
          amount: quantity * 500,
        },
      ],
      shipments,
      documents: [],
    }) as any;

  it.each([
    [90, 22, [22, 22, 22, 22, 2]],
    [500, 100, [100, 100, 100, 100, 100]],
    [415, 37, [37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 8]],
  ])(
    'create() allows Rail Freight / Wagon when qty=%d and qtyPerCount=%d',
    async (quantity, qtyPerCount, expectedQtys) => {
      const dto = baseDto(
        'rail',
        quantity,
        qtyPerCount,
        expectedQtys.map((q, idx) => ({
          shipmentNo: idx + 1,
          shipmentDate: '2026-11-26',
          quantity: q,
          noOfContainers: 1,
        })),
      );

      const created = await service.create(dto, { companyId: 1, userId: 1 });
      expect(created.id).toBe(101);
      expect(mockShipmentModel.bulkCreate).toHaveBeenCalledTimes(1);
      const createdShipments = mockShipmentModel.bulkCreate.mock.calls[0][0];
      expect(createdShipments.map((s: any) => s.quantity)).toEqual(expectedQtys);
    },
  );

  it('create() auto-distributes remainder when Rail Freight / Wagon shipments need distribution', async () => {
    const dto = baseDto('rail', 90, 22, [
      { shipmentNo: 1, shipmentDate: '2026-11-26', quantity: 10, noOfContainers: 1 },
      { shipmentNo: 2, shipmentDate: '2026-11-26', quantity: 10, noOfContainers: 1 },
      { shipmentNo: 3, shipmentDate: '2026-11-26', quantity: 10, noOfContainers: 1 },
      { shipmentNo: 4, shipmentDate: '2026-11-26', quantity: 10, noOfContainers: 1 },
      { shipmentNo: 5, shipmentDate: '2026-11-26', quantity: 10, noOfContainers: 1 },
    ]);

    await service.create(dto, { companyId: 1, userId: 1 });
    const createdShipments = mockShipmentModel.bulkCreate.mock.calls[0][0];
    expect(createdShipments.map((s: any) => s.quantity)).toEqual([22, 22, 22, 22, 2]);
  });

  it.each(['sea', 'road', 'bulk', 'air'])(
    'create() still rejects non-multiple quantity (90 vs 22) for %s mode',
    async (mode) => {
      const dto = baseDto(mode, 90, 22, [
        { shipmentNo: 1, shipmentDate: '2026-11-26', quantity: 90, noOfContainers: 1 },
      ]);

      await expect(service.create(dto, { companyId: 1, userId: 1 })).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('update() allows non-multiple items for existing Rail Freight contract even if mode is omitted from dto', async () => {
    const mockExistingContract: any = {
      id: 101,
      companyId: 1,
      contractNumber: 'SC-RAIL-001',
      originTransportMode: 'rail',
      destinationTransportMode: 'rail',
      transportMode: 'sea',
      totalQuantity: 88,
      totalAmount: 44000,
      status: 'Draft',
      printOverrides: {},
      update: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(mockExistingContract);

    await expect(
      service.update(
        101,
        {
          items: [
            {
              productId: 1,
              bagTypeId: 1,
              packingTypeId: 1,
              quality: 'Standard',
              qtyPerCount: 22,
              quantity: 90,
              unitPrice: 500,
              amount: 45000,
            },
          ],
        } as any,
        { companyId: 1, userId: 1 },
      ),
    ).resolves.toBe(mockExistingContract);
  });

  it('update() rejects non-multiple items when mode changes from rail to sea', async () => {
    const mockExistingContract: any = {
      id: 101,
      companyId: 1,
      contractNumber: 'SC-RAIL-001',
      originTransportMode: 'rail',
      destinationTransportMode: 'rail',
      transportMode: 'sea',
      totalQuantity: 90,
      totalAmount: 45000,
      status: 'Draft',
      printOverrides: {},
      update: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(mockExistingContract);

    await expect(
      service.update(
        101,
        {
          originTransportMode: 'sea',
          destinationTransportMode: 'sea',
          items: [
            {
              productId: 1,
              bagTypeId: 1,
              packingTypeId: 1,
              quality: 'Standard',
              qtyPerCount: 22,
              quantity: 90,
              unitPrice: 500,
              amount: 45000,
            },
          ],
        } as any,
        { companyId: 1, userId: 1 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('create() emits sales-target:updated to linked enquiry creator when contract is created from enquiry', async () => {
    const mockNotificationsGateway = { emitToUser: jest.fn() };
    const serviceWithGateway = new SalesContractService(
      mockContractModel,
      mockItemModel,
      mockShipmentModel,
      mockDocumentModel,
      mockDocumentFileModel,
      mockTransportDetailModel,
      {} as any,
      mockSequelize,
      { ensureForSalesContract: jest.fn() } as any,
      mockNotificationsGateway as any,
      undefined,
    );

    jest.spyOn(Enquiry, 'findByPk').mockResolvedValue({
      id: 'enq-uuid-1',
      partnerId: 1,
      brokerId: null,
      createdBy: 10,
    } as any);

    const dto = {
      ...baseDto('sea', 88, 22, [
        { shipmentNo: 1, shipmentDate: '2026-11-27', quantity: 88, noOfContainers: 4 },
      ]),
      enquiryId: 'enq-uuid-1',
    };

    await serviceWithGateway.create(dto, { companyId: 1, userId: 1 });

    expect(mockNotificationsGateway.emitToUser).toHaveBeenCalledWith(
      1,
      'sales-target:updated',
      expect.objectContaining({ contractId: 101, action: 'contract_created' }),
    );
    expect(mockNotificationsGateway.emitToUser).toHaveBeenCalledWith(
      10,
      'sales-target:updated',
      expect.objectContaining({ contractId: 101, action: 'contract_created' }),
    );
  });
});
