import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseContractService } from './purchase-contract.service';
import { PurchaseContractActivityService } from './purchase-contract-activity.service';
import { Sequelize } from 'sequelize-typescript';
import { PurchaseContract } from '../models/purchase-contract.model';
import { PurchaseContractItem } from '../models/purchase-contract-item.model';
import { PurchaseContractShipment } from '../models/purchase-contract-shipment.model';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractShipment } from '../../sales-contracts/models/sales-contract-shipment.model';
import { BusinessTransactionService } from '../../system/services/business-transaction.service';
import { ShipmentService } from '../../sales-contracts/shipment.service';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';

describe('PurchaseContractAllocationEngine (Dynamic Shipment Reallocation)', () => {
  let service: PurchaseContractService;

  const mockSalesContract = {
    id: 1,
    contractNumber: 'SC-2026-001',
    totalQuantity: 88,
    companyId: 1,
    sellerId: 10,
    contractDate: new Date('2026-01-01'),
    items: [{ productId: 1, quantity: 88, qtyPerCount: 22, unitPrice: 500 }],
  };

  const mockSalesShipments = [
    { id: 1, salesContractId: 1, quantity: 22, shipmentSequence: 1, shipmentNo: 'S1', status: 'Pending' },
    { id: 2, salesContractId: 1, quantity: 22, shipmentSequence: 2, shipmentNo: 'S2', status: 'Pending' },
    { id: 3, salesContractId: 1, quantity: 22, shipmentSequence: 3, shipmentNo: 'S3', status: 'Pending' },
    { id: 4, salesContractId: 1, quantity: 22, shipmentSequence: 4, shipmentNo: 'S4', status: 'Pending' },
  ];

  let purchaseContractsStore: any[] = [];
  let shipmentLinksStore: any[] = [];

  beforeEach(async () => {
    purchaseContractsStore = [];
    shipmentLinksStore = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseContractService,
        {
          provide: getModelToken(SalesContract),
          useValue: {
            findByPk: jest.fn().mockResolvedValue(mockSalesContract),
            findOne: jest.fn().mockResolvedValue(mockSalesContract),
            update: jest.fn().mockResolvedValue([1]),
          },
        },
        {
          provide: getModelToken(SalesContractShipment),
          useValue: {
            findAll: jest.fn().mockResolvedValue(mockSalesShipments),
            findOne: jest.fn().mockResolvedValue(mockSalesShipments[0]),
            update: jest.fn().mockResolvedValue([1]),
          },
        },
        {
          provide: getModelToken(PurchaseContract),
          useValue: {
            findAll: jest.fn().mockImplementation(async (query: any) => {
              let res = [...purchaseContractsStore];
              if (query?.where?.salesContractId) {
                res = res.filter((pc) => pc.salesContractId === query.where.salesContractId);
              }
              if (query?.where?.id?.[Op.ne] !== undefined) {
                res = res.filter((pc) => pc.id !== query.where.id[Op.ne]);
              }
              const notInFilter = query?.where?.status?.[Op.notIn] || query?.where?.status?.[Symbol.for('sequelize.op') || Op.notIn];
              if (Array.isArray(notInFilter)) {
                res = res.filter((pc) => !notInFilter.includes(pc.status));
              }
              return res;
            }),
            findByPk: jest.fn().mockImplementation(async (id) => {
              return purchaseContractsStore.find((pc) => pc.id === id) || null;
            }),
            findOne: jest.fn().mockImplementation(async (query: any) => {
              const id = query?.where?.id;
              return purchaseContractsStore.find((pc) => pc.id === id) || null;
            }),
            count: jest.fn().mockImplementation(async () => purchaseContractsStore.length),
            create: jest.fn().mockImplementation(async (dto) => {
              const newPc = {
                id: purchaseContractsStore.length + 1,
                ...dto,
                status: dto.status || 'Draft',
                reload: async function () { return this; },
                update: async function (fields: any) {
                  Object.assign(this, fields);
                  return this;
                },
              };
              purchaseContractsStore.push(newPc);
              return newPc;
            }),
          },
        },
        {
          provide: getModelToken(PurchaseContractItem),
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            destroy: jest.fn().mockResolvedValue(1),
            update: jest.fn().mockResolvedValue([1]),
          },
        },
        {
          provide: getModelToken(PurchaseContractShipment),
          useValue: {
            findAll: jest.fn().mockImplementation(async (query: any) => {
              let res = [...shipmentLinksStore];
              if (query?.where?.purchaseContractId) {
                const pcIdCond = query.where.purchaseContractId;
                if (typeof pcIdCond === 'object' && pcIdCond[Op.in]) {
                  const ids = pcIdCond[Op.in];
                  res = res.filter((l) => ids.includes(l.purchaseContractId));
                } else {
                  res = res.filter((l) => l.purchaseContractId === pcIdCond);
                }
              }
              return res;
            }),
            findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
            count: jest.fn().mockImplementation(async (query: any) => {
              if (query?.where?.purchaseContractId) {
                return shipmentLinksStore.filter((l) => l.purchaseContractId === query.where.purchaseContractId).length;
              }
              return shipmentLinksStore.length;
            }),
            create: jest.fn().mockImplementation(async (dto) => {
              shipmentLinksStore.push(dto);
              return dto;
            }),
            bulkCreate: jest.fn().mockImplementation(async (records: any[]) => {
              for (const r of records) {
                shipmentLinksStore.push(r);
              }
              return records;
            }),
            findOrCreate: jest.fn().mockImplementation(async (args) => {
              const existing = shipmentLinksStore.find(
                (l) => l.purchaseContractId === args.defaults.purchaseContractId && l.shipmentId === args.defaults.shipmentId
              );
              if (existing) return [existing, false];
              shipmentLinksStore.push(args.defaults);
              return [args.defaults, true];
            }),
            destroy: jest.fn().mockImplementation(async (query: any) => {
              if (query?.where?.purchaseContractId) {
                const pcIdCond = query.where.purchaseContractId;
                if (typeof pcIdCond === 'object' && pcIdCond[Op.in]) {
                  const ids = pcIdCond[Op.in];
                  shipmentLinksStore = shipmentLinksStore.filter((l) => !ids.includes(l.purchaseContractId));
                } else {
                  shipmentLinksStore = shipmentLinksStore.filter((l) => l.purchaseContractId !== pcIdCond);
                }
              }
              return 1;
            }),
          },
        },
        {
          provide: getModelToken(PurchaseContractRequiredDocument),
          useValue: {},
        },
        {
          provide: PurchaseContractActivityService,
          useValue: { log: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: BusinessTransactionService,
          useValue: { ensureForPurchaseContract: jest.fn().mockResolvedValue(true), ensureForSalesContract: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: Sequelize,
          useValue: {
            transaction: jest.fn().mockImplementation(async (cb) => cb({})),
            query: jest.fn().mockResolvedValue([[]]),
          },
        },
        {
          provide: ShipmentService,
          useValue: { ensureExecutionRecordsForShipmentId: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<PurchaseContractService>(PurchaseContractService);
  });

  it('should support Case 1: PC1 = 88 MT covering all 4 shipments', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 88);
    expect(pc1.quantity).toEqual('88');
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).length).toEqual(4);
  });

  it('should support Case 2: PC1 = 66 MT and PC2 = 22 MT without overlapping shipments', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 66);
    expect(pc1.quantity).toEqual('66');
    const pc1Links = shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id);
    expect(pc1Links.map((l) => l.shipmentId)).toEqual([1, 2, 3]);

    const pc2 = await service.ensureExists(1, 1, undefined, true, 22);
    expect(pc2.quantity).toEqual('22');
    const pc2Links = shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id);
    expect(pc2Links.map((l) => l.shipmentId)).toEqual([4]);
  });

  it('should support Case 3: PC1 = 44 MT and PC2 = 44 MT', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 44);
    expect(pc1.quantity).toEqual('44');
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).map((l) => l.shipmentId)).toEqual([1, 2]);

    const pc2 = await service.ensureExists(1, 1, undefined, true, 44);
    expect(pc2.quantity).toEqual('44');
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([3, 4]);
  });

  it('should execute EXACT user scenario: 66 -> 44 on PC1, then 22 -> 44 on PC2', async () => {
    // Initial Setup: PC1 = 66 MT (S1, S2, S3), PC2 = 22 MT (S4)
    const pc1 = await service.ensureExists(1, 1, undefined, true, 66);
    const pc2 = await service.ensureExists(1, 1, undefined, true, 22);

    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).map((l) => l.shipmentId)).toEqual([1, 2, 3]);
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([4]);

    // Step 1: Edit PC1 from 66 -> 44
    // Expected Allocation:
    // PC1: Shipment 1 = 22, Shipment 2 = 22 (Total 44 MT)
    // PC2: Shipment 3 = 22 (Total 22 MT)
    // Remaining unallocated: Shipment 4 = 22
    await service.update(pc1.id, { quantity: '44' }, { companyId: 1, userId: 1 });

    const pc1LinksAfterEdit1 = shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id);
    const pc2LinksAfterEdit1 = shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id);

    expect(pc1LinksAfterEdit1.map((l) => l.shipmentId)).toEqual([1, 2]);
    expect(pc2LinksAfterEdit1.map((l) => l.shipmentId)).toEqual([3]);

    // Step 2: Edit PC2 from 22 -> 44
    // Expected Allocation:
    // PC1: Shipment 1, Shipment 2 (Total 44 MT)
    // PC2: Shipment 3, Shipment 4 (Total 44 MT)
    await service.update(pc2.id, { quantity: '44' }, { companyId: 1, userId: 1 });

    const pc1LinksAfterEdit2 = shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id);
    const pc2LinksAfterEdit2 = shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id);

    expect(pc1LinksAfterEdit2.map((l) => l.shipmentId)).toEqual([1, 2]);
    expect(pc2LinksAfterEdit2.map((l) => l.shipmentId)).toEqual([3, 4]);
    expect(shipmentLinksStore).toHaveLength(4);
  });

  it('should support freely editable quantities: 44 -> 22, then 44 -> 66, and 22 -> 66, 66 -> 22', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 44);
    const pc2 = await service.ensureExists(1, 1, undefined, true, 44);

    // PC1: 44 -> 22
    await service.update(pc1.id, { quantity: '22' }, { companyId: 1, userId: 1 });
    // PC2: 44 -> 66
    await service.update(pc2.id, { quantity: '66' }, { companyId: 1, userId: 1 });

    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).map((l) => l.shipmentId)).toEqual([1]);
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([2, 3, 4]);

    // PC2: 66 -> 22
    await service.update(pc2.id, { quantity: '22' }, { companyId: 1, userId: 1 });
    // PC1: 22 -> 66
    await service.update(pc1.id, { quantity: '66' }, { companyId: 1, userId: 1 });

    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).map((l) => l.shipmentId)).toEqual([1, 2, 3]);
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([4]);
  });

  it('should only fail validation when Total Purchase Contract Quantity > Sales Contract Quantity (88 MT)', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 66);
    const pc2 = await service.ensureExists(1, 1, undefined, true, 22);

    // PC1 is 66, trying to set PC2 to 44 -> 66 + 44 = 110 MT > 88 MT -> Must fail!
    await expect(
      service.update(pc2.id, { quantity: '44' }, { companyId: 1, userId: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([23, 30, 45, 67])(
    'should reject invalid quantity %d that is not an exact multiple of Qty Per Count (22 MT)',
    async (invalidQty) => {
      await expect(
        service.ensureExists(1, 1, undefined, true, invalidQty),
      ).rejects.toThrow(
        /Purchase Contract quantity must be in multiples of the Sales Contract shipment size \(22 MT\)/,
      );
    },
  );

  it('should accept only valid multiples of Qty Per Count (22, 44, 66, 88)', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 22);
    expect(pc1.quantity).toEqual('22');

    await service.update(pc1.id, { quantity: '44' }, { companyId: 1, userId: 1 });
    expect(pc1.quantity).toEqual('44');

    await service.update(pc1.id, { quantity: '66' }, { companyId: 1, userId: 1 });
    expect(pc1.quantity).toEqual('66');

    await service.update(pc1.id, { quantity: '88' }, { companyId: 1, userId: 1 });
    expect(pc1.quantity).toEqual('88');
  });

  it('should release links on delete/cancel and reallocate them on reactivation', async () => {
    const pc1 = await service.ensureExists(1, 1, undefined, true, 44);
    const pc2 = await service.ensureExists(1, 1, undefined, true, 44);

    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id)).toHaveLength(2);
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id)).toHaveLength(2);

    // Cancel PC1
    await service.remove(pc1.id, { companyId: 1, userId: 1 });
    expect(pc1.status).toEqual('Cancelled');
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id)).toHaveLength(0);

    // PC2 now reallocates to the first available shipments (S1, S2)
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([1, 2]);

    // Reactivate PC1 back to Draft
    const reactivated = await service.updateStatus(
      pc1.id,
      { status: 'Draft' },
      { companyId: 1, userId: 1 },
    );
    expect(reactivated.status).toEqual('Draft');

    // PC1 gets S1, S2 and PC2 gets S3, S4
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc1.id).map((l) => l.shipmentId)).toEqual([1, 2]);
    expect(shipmentLinksStore.filter((l) => l.purchaseContractId === pc2.id).map((l) => l.shipmentId)).toEqual([3, 4]);
  });
});
