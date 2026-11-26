import { LogisticsService } from './logistics.service';
import { Op } from 'sequelize';

describe('LogisticsService - Purchase Contracts Queue & Tab Routing', () => {
  let service: LogisticsService;
  let mockSequelize: any;
  let mockTransportEnquiryHiddenModel: any;
  let mockEnquiryModel: any;

  beforeEach(() => {
    mockSequelize = {
      models: {
        Company: {
          findByPk: jest.fn().mockResolvedValue({ id: 1, country: 'India' }),
        },
      },
      query: jest.fn(),
    };

    mockTransportEnquiryHiddenModel = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    mockEnquiryModel = {
      findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    };

    service = new LogisticsService(
      {} as any, // logisticsModel
      {} as any, // quoteModel
      {} as any, // chargeMasterModel
      {} as any, // quoteChargeModel
      {} as any, // containerRateModel
      {} as any, // logisticsRouteModel
      mockEnquiryModel,
      {} as any, // salesContractModel
      {} as any, // shipmentModel
      {} as any, // attachmentModel
      {} as any, // partnerModel
      {} as any, // partnerContactModel
      mockTransportEnquiryHiddenModel,
      {} as any, // attachmentsService
      {} as any, // auditService
      mockSequelize,
      {} as any, // shipmentService
      {} as any, // readinessService
    );
  });

  it('should route tab=purchase-contracts directly to findPurchaseContractsQueue', async () => {
    const mockRows = [
      {
        id: 101,
        contract_number: 'PC-EA.2632627',
        status: 'Confirmed',
        quantity: '500',
        place_of_loading: 'Nagpur',
        loading_country: 'India',
        delivery_place: 'Qingdao',
        created_at: new Date(),
        seller_name: 'Nagpur Farmers Ltd',
        buyer_name: 'Agricom Global',
        shipment_type_name: 'EXW',
        purchase_shipment_type_code: 'EXW',
        sales_shipment_type_code: 'FOB',
        transport_mode: 'ROAD',
        business_reference: 'BR-999',
        product_name: 'Soybean',
        logistics_id: null,
        logistics_status: null,
        logistics_is_viewed: null,
        enquiry_creator_id: 7,
        enquiry_creator_name: 'PRIYA SHARMA',
      },
    ];

    mockSequelize.query.mockResolvedValueOnce(mockRows);

    const result = await service.findQueue({ tab: 'purchase-contracts', page: 1, limit: 10 }, 1, 12);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].enquiryNo).toBeNull();
    expect(result.data[0].createdBy).toBe(7);
    expect(result.data[0].createdByName).toBe('PRIYA SHARMA');
    expect(result.data[0].creator).toEqual({ id: 7, name: 'PRIYA SHARMA' });
    expect(result.data[0].purchaseContract.contractNumber).toBe('PC-EA.2632627');
    expect(result.data[0].isPurchaseContract).toBe(true);
    expect(result.data[0].sourceType).toBe('PurchaseContract');
    expect(result.data[0].incoterm).toBe('EXW');
    expect(result.data[0].origin).toBe('Nagpur, India');
    expect(result.data[0].destination).toBe('Qingdao');
    expect(mockEnquiryModel.findAndCountAll).not.toHaveBeenCalled();
  });

  it('includes enquiry creator on active queue rows', async () => {
    const enquiryRow = {
      id: 'enq-uuid-1',
      enquiryNo: 'ENQ-000098',
      shipmentType: 'DAP',
      freightRequired: true,
      creator: { id: 7, name: 'PRIYA SHARMA' },
      transportDetails: [
        {
          id: 11,
          sequence: 1,
          origin: 'kostenay',
          incoterm: 'DAP',
          destination: 'AUGSBURG',
        },
      ],
      toJSON: jest.fn().mockReturnValue({
        id: 'enq-uuid-1',
        enquiryNo: 'ENQ-000098',
        shipmentType: 'DAP',
        freightRequired: true,
        creator: { id: 7, name: 'PRIYA SHARMA' },
        transportDetails: [
          {
            id: 11,
            sequence: 1,
            origin: 'kostenay',
            incoterm: 'DAP',
            destination: 'AUGSBURG',
          },
        ],
      }),
      setDataValue: jest.fn(),
    };
    mockEnquiryModel.findAndCountAll.mockResolvedValueOnce({
      rows: [enquiryRow],
      count: 1,
    });
    mockSequelize.query.mockResolvedValueOnce([]);

    const result = await service.findQueue({ tab: 'active', page: 1, limit: 10 }, 1);

    const options = mockEnquiryModel.findAndCountAll.mock.calls[0][0];
    expect(options.include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: 'creator',
          attributes: ['id', 'name'],
          required: false,
        }),
      ]),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].createdByName).toBe('PRIYA SHARMA');
    expect(result.data[0].creator).toEqual({ id: 7, name: 'PRIYA SHARMA' });
  });

  it('searches active enquiries by Business Reference in the unified search', async () => {
    await service.findQueue({ search: 'REF-123', page: 1, limit: 10 }, 1);

    const options = mockEnquiryModel.findAndCountAll.mock.calls[0][0];
    const conditions = options.where[Op.and];
    const searchCondition = conditions.find((condition: any) =>
      condition[Op.or]?.some((match: any) =>
        Object.prototype.hasOwnProperty.call(
          match,
          '$businessTransaction.businessReference$',
        ),
      ),
    );

    expect(searchCondition).toBeDefined();
    expect(
      searchCondition[Op.or].find((match: any) =>
        Object.prototype.hasOwnProperty.call(
          match,
          '$businessTransaction.businessReference$',
        ),
      )['$businessTransaction.businessReference$'][Op.iLike],
    ).toBe('%REF-123%');
  });

  it('should not contain non-existent columns (st.transport_mode, sc.delivery_place) in executed SQL query', async () => {
    mockSequelize.query.mockResolvedValueOnce([]);

    await service.findPurchaseContractsQueue({ page: 1, limit: 10 }, 1);

    expect(mockSequelize.query).toHaveBeenCalledTimes(1);
    const selectSql = mockSequelize.query.mock.calls[0][0];
    expect(selectSql).not.toContain('st.transport_mode');
    expect(selectSql).not.toContain('pc.purchase_date');
    expect(selectSql).not.toContain('sc.delivery_place');
    expect(selectSql).toContain('COALESCE(log.transport_mode, sc.transport_mode, \'ROAD\') AS transport_mode');
    expect(selectSql).toContain('COALESCE(sc.destination_location_name, sc.port_of_discharge, sc.enquiry_destination) AS sc_delivery_place');
    expect(selectSql).not.toContain('pc.freight_required');
    expect(selectSql).toContain('st.code AS purchase_shipment_type_code');
    expect(selectSql).toContain('sc_st.code AS sales_shipment_type_code');
  });

  it('excludes FCA/FCA Purchase Contracts even when the stored flag is true', async () => {
    mockSequelize.query.mockResolvedValueOnce([
      {
        id: 102,
        contract_number: 'PC-FCA-FCA',
        status: 'Confirmed',
        freight_required: true,
        purchase_shipment_type_code: 'FCA',
        sales_shipment_type_code: 'FCA',
      },
    ]);

    const result = await service.findPurchaseContractsQueue(
      { page: 1, limit: 10 },
      1,
    );

    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
  });

  it('should throw BadRequestException in getDetails when targetShipment has freightRequired = false', async () => {
    const mockShipmentModel = {
      findByPk: jest.fn().mockResolvedValue({
        id: 99,
        freightRequired: false,
        salesContract: { id: 1, shipmentType: { code: 'FCA' } },
      }),
    };
    const mockReadinessService = {
      evaluate: jest.fn().mockResolvedValue({
        freightRequired: false,
        cargoReady: true,
        freightReady: false,
      }),
    };

    const localService = new LogisticsService(
      { findOne: jest.fn(), create: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockEnquiryModel,
      {} as any,
      mockShipmentModel as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      mockSequelize,
      {} as any,
      mockReadinessService as any,
    );

    await expect(localService.getDetails('some-enquiry-uuid', 1, 99)).rejects.toThrow(
      'Transport Management is not available for Shipment #99 because Freight is not required (Freight Required = NO).',
    );
  });

  it('should include the loading country in an existing Purchase Contract route', async () => {
    const route = {
      id: 55,
      origin: 'TIMIRYAZEVO',
      update: jest.fn(),
    };
    const quoteModel = { update: jest.fn() };
    const localService = new LogisticsService(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 88,
          setDataValue: jest.fn(),
        }),
      } as any,
      quoteModel as any,
      {} as any,
      {} as any,
      {} as any,
      { findAll: jest.fn().mockResolvedValue([route]) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      {
        models: {
          PurchaseContract: {
            findOne: jest.fn().mockResolvedValue({
              id: 123,
              contract_number: 'PC-123',
              freight_required: true,
              placeOfLoading: 'TIMIRYAZEVO',
              loadingCountry: 'Kazakhstan',
              delivery_place: 'Surabaya',
            }),
          },
        },
        query: jest.fn(),
      } as any,
      {} as any,
      {} as any,
    );

    await localService.getDetails('123', 1);

    expect(route.update).toHaveBeenCalledWith({
      origin: 'TIMIRYAZEVO, Kazakhstan',
    });
    expect(quoteModel.update).toHaveBeenCalledWith(
      { origin: 'TIMIRYAZEVO, Kazakhstan' },
      { where: { routeId: { [Op.in]: [55] } } },
    );
  });

  it('should resolve the Sales Contract by business transaction when its enquiry link is missing', async () => {
    const enquiry = {
      id: '00000000-0000-0000-0000-000000000001',
      businessTransactionId: 777,
      transportDetails: [],
      setDataValue: jest.fn(),
    };
    const salesContract = {
      id: 42,
      contractNumber: 'SC-42',
      toJSON: jest.fn().mockReturnValue({ id: 42 }),
    };
    const logistics = {
      id: 9,
      isViewed: true,
      setDataValue: jest.fn(),
    };
    const salesContractModel = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(
          where.businessTransactionId === 777 ? salesContract : null,
        ),
      ),
    };
    const localService = new LogisticsService(
      { findOne: jest.fn().mockResolvedValue(logistics) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(enquiry) } as any,
      salesContractModel as any,
      {
        findOne: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      {
        models: { TransportDetail: {} },
        query: jest.fn().mockResolvedValue([]),
      } as any,
      {} as any,
      {} as any,
    );

    const result = await localService.getDetails(enquiry.id, 1);

    expect(result.salesContractId).toBe(42);
    expect(result.salesContract).toEqual({ id: 42 });
    expect(salesContractModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessTransactionId: 777 },
      }),
    );
  });

  it('should resolve a Purchase Contract workspace through its linked Sales Contract transaction', async () => {
    const enquiry = {
      id: '00000000-0000-0000-0000-000000000001',
      businessTransactionId: 777,
      transportDetails: [],
      setDataValue: jest.fn(),
    };
    const salesContract = {
      id: 42,
      businessTransactionId: 777,
      enquiryId: null,
      toJSON: jest.fn().mockReturnValue({ id: 42 }),
    };
    const salesContractModel = {
      findByPk: jest.fn().mockResolvedValue(salesContract),
      findOne: jest.fn(({ where }) =>
        Promise.resolve(
          where.businessTransactionId === 777 ? salesContract : null,
        ),
      ),
    };
    const logistics = {
      id: 9,
      isViewed: true,
      setDataValue: jest.fn(),
    };
    const localService = new LogisticsService(
      { findOne: jest.fn().mockResolvedValue(logistics) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(enquiry) } as any,
      salesContractModel as any,
      {
        findOne: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      {
        models: {
          TransportDetail: {},
          PurchaseContract: {
            findOne: jest.fn().mockResolvedValue({
              id: 123,
              salesContractId: 42,
              businessTransactionId: 777,
              freight_required: true,
            }),
          },
        },
        query: jest.fn().mockResolvedValue([]),
      } as any,
      {} as any,
      {} as any,
    );

    const result = await localService.getDetails('123', 1);

    expect(result.salesContractId).toBe(42);
    expect(salesContractModel.findByPk).not.toHaveBeenCalled();
    expect(salesContractModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessTransactionId: 777 },
      }),
    );
  });

  it('should load only the requested shipment and its freight quotes in shipment context', async () => {
    const enquiry = {
      id: '00000000-0000-0000-0000-000000000001',
      businessTransactionId: 777,
      transportDetails: [],
      setDataValue: jest.fn(),
    };
    const targetShipment = {
      id: 99,
      salesContractId: 42,
      shipmentNo: 1,
      shipmentReference: 'CA.52627/1/C1/NOV/26',
      freightRequired: true,
      status: 'Scheduled',
      setDataValue: jest.fn(),
    };
    const salesContract = {
      id: 42,
      contractNumber: 'SC-42',
      businessTransactionId: 777,
      buyer: { entityName: 'Buyer' },
      seller: { entityName: 'Seller' },
      toJSON: jest.fn().mockReturnValue({ id: 42 }),
    };
    const logistics = {
      id: 9,
      isViewed: true,
      setDataValue: jest.fn(),
    };
    const quote = { id: 501, shipmentId: 99, isPreferred: true, toJSON: () => ({ id: 501, shipmentId: 99, isPreferred: true }) };
    const shipmentModel = {
      findByPk: jest.fn().mockResolvedValue(targetShipment),
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn(),
    };
    const quoteModel = { findAll: jest.fn().mockResolvedValue([quote]) };
    const localService = new LogisticsService(
      { findOne: jest.fn().mockResolvedValue(logistics) } as any,
      quoteModel as any,
      {} as any,
      {} as any,
      {} as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(enquiry) } as any,
      { findOne: jest.fn().mockResolvedValue(salesContract) } as any,
      shipmentModel as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      {
        models: { TransportDetail: {}, PurchaseContract: {} },
        query: jest.fn().mockResolvedValue([
          {
            id: 123,
            contract_number: 'PC-123',
            freight_required: true,
            sales_contract_id: 42,
            business_transaction_id: 777,
          },
        ]),
      } as any,
      {} as any,
      {
        evaluate: jest.fn().mockResolvedValue({
          freightRequired: true,
          cargoReady: true,
          freightReady: true,
          readyForShipment: true,
          reasons: [],
        }),
        evaluateBatch: jest.fn(),
      } as any,
    );
    const syncRoutesSpy = jest
      .spyOn(localService, 'syncLogisticsRoutesForEnquiry')
      .mockResolvedValue([]);

    const result = await localService.getDetails(enquiry.id, 1, 99);

    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].id).toBe(99);
    expect(result.shipments[0].quotes).toEqual([
      { id: 501, shipmentId: 99, isPreferred: true },
    ]);
    expect(shipmentModel.findAll).not.toHaveBeenCalled();
    expect(quoteModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shipmentId: 99 } }),
    );
    expect(syncRoutesSpy).not.toHaveBeenCalled();
    const logisticsQuery =
      (localService as any).logisticsModel.findOne.mock.calls[0][0];
    expect(logisticsQuery.include[0]).toEqual(
      expect.objectContaining({
        as: 'quotes',
        where: { shipmentId: 99 },
        required: false,
      }),
    );
  });

  it('should scope freight quote deletion to the selected shipment when provided', async () => {
    const quoteModel = { findOne: jest.fn().mockResolvedValue(null) };
    const localService = new LogisticsService(
      {} as any,
      quoteModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      mockSequelize,
      {} as any,
      {} as any,
    );

    await expect(
      localService.deleteFreightQuote(9, 501, { userId: 1 }, 1, 99),
    ).rejects.toThrow('Freight quote not found');
    expect(quoteModel.findOne).toHaveBeenCalledWith({
      where: { id: 501, logisticsId: 9, shipmentId: 99 },
    });
  });

  it('should throw BadRequestException in createFreightQuote when targetShipment has freightRequired = false', async () => {
    const mockShipmentModel = {
      findByPk: jest.fn().mockResolvedValue({
        id: 99,
        freightRequired: false,
        salesContract: { id: 1, shipmentType: { code: 'FCA' } },
      }),
    };
    const mockLogisticsModel = {
      findByPk: jest.fn().mockResolvedValue({ id: 1, purchaseContractId: 10 }),
    };
    const mockReadinessService = {
      evaluate: jest.fn().mockResolvedValue({
        freightRequired: false,
      }),
    };

    const localService = new LogisticsService(
      mockLogisticsModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockEnquiryModel,
      {} as any,
      mockShipmentModel as any,
      {} as any,
      {} as any,
      {} as any,
      mockTransportEnquiryHiddenModel,
      {} as any,
      {} as any,
      mockSequelize,
      {} as any,
      mockReadinessService as any,
    );

    await expect(
      localService.createFreightQuote(1, { shipmentId: 99, freightAmount: 100 } as any, { userId: 1 }, 1),
    ).rejects.toThrow(
      'Cannot add freight quote for Shipment #99 because Freight is not required for this shipment (Freight Required = NO).',
    );
  });

  it('sets Freight Allocation YES only after a preferred quote is assigned to transport', async () => {
    const transaction = {};
    const shipment = {
      id: 99,
      update: jest.fn().mockResolvedValue(undefined),
    };
    const logistics = {
      id: 9,
      selectedFreightId: 501,
      status: 'Preferred Quote Selected',
      update: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue({ id: 9 }),
    };
    Object.assign(service as any, {
      logisticsModel: { findByPk: jest.fn().mockResolvedValue(logistics) },
      quoteModel: {
        findByPk: jest.fn().mockResolvedValue({
          id: 501,
          logisticsId: 9,
          shipmentId: 99,
          isPreferred: true,
          isRejected: false,
        }),
      },
      shipmentModel: { findByPk: jest.fn().mockResolvedValue(shipment) },
      readinessService: {
        evaluate: jest.fn().mockResolvedValue({ freightRequired: true }),
      },
      sequelize: { transaction: jest.fn((callback) => callback(transaction)) },
      auditService: { writeLog: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateStatus(9, { status: 'Transport Assigned' }, { userId: 1 });

    expect(shipment.update).toHaveBeenCalledWith(
      { logisticsId: 9, freightAllocationStatus: 'Yes' },
      { transaction },
    );
  });

  it('does not allow Transport Assigned without a selected preferred quote', async () => {
    const logistics = {
      id: 9,
      selectedFreightId: null,
      status: 'Pending',
      update: jest.fn(),
    };
    Object.assign(service as any, {
      logisticsModel: { findByPk: jest.fn().mockResolvedValue(logistics) },
      sequelize: { transaction: jest.fn() },
    });

    await expect(
      service.updateStatus(9, { status: 'Transport Assigned' }, { userId: 1 }),
    ).rejects.toThrow(
      'Select a valid preferred freight quote before assigning transport.',
    );
    expect(logistics.update).not.toHaveBeenCalled();
  });

  describe('Shipments Management Rail Freight Quote Multi-Shipment Auto-Apply & Edit Sync', () => {
    const buildSyncTestHarness = (originTransportMode: string = 'rail') => {
      const shipmentRecords: Record<number, any> = {
        101: {
          id: 101,
          companyId: 1,
          salesContractId: 50,
          logisticsId: 9,
          shipmentNo: 1,
          shipmentSequence: 1,
          businessTransactionId: 700,
          freight: null,
          status: 'Scheduled',
          salesContract: {
            id: 50,
            originTransportMode,
            shipmentType: { code: 'CIF' },
          },
          update: jest.fn(function (vals: any) {
            Object.assign(this, vals);
            return Promise.resolve(this);
          }),
        },
        102: {
          id: 102,
          companyId: 1,
          salesContractId: 50,
          logisticsId: null,
          shipmentNo: 2,
          shipmentSequence: 2,
          businessTransactionId: 700,
          freight: null,
          status: 'Scheduled',
          salesContract: {
            id: 50,
            originTransportMode,
            shipmentType: { code: 'CIF' },
          },
          update: jest.fn(function (vals: any) {
            Object.assign(this, vals);
            return Promise.resolve(this);
          }),
        },
        103: {
          id: 103,
          companyId: 1,
          salesContractId: 50,
          logisticsId: null,
          shipmentNo: 3,
          shipmentSequence: 3,
          businessTransactionId: 700,
          freight: null,
          status: 'Scheduled',
          salesContract: {
            id: 50,
            originTransportMode,
            shipmentType: { code: 'CIF' },
          },
          update: jest.fn(function (vals: any) {
            Object.assign(this, vals);
            return Promise.resolve(this);
          }),
        },
      };

      const createdQuotes: any[] = [];
      const createdCharges: any[] = [];
      let quoteIdSeq = 500;
      let fqSeq = 10;

      const quoteModel = {
        create: jest.fn((data: any) => {
          const id = ++quoteIdSeq;
          const record = {
            id,
            ...data,
            toJSON() {
              return { ...this };
            },
          };
          createdQuotes.push(record);
          return Promise.resolve(record);
        }),
        findByPk: jest.fn((id: number) =>
          Promise.resolve(createdQuotes.find((q) => q.id === id) || null),
        ),
        findOne: jest.fn(),
        findAll: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      };

      const quoteChargeModel = {
        bulkCreate: jest.fn((rows: any[]) => {
          createdCharges.push(...rows);
          return Promise.resolve(rows);
        }),
        findAll: jest.fn().mockResolvedValue([]),
        destroy: jest.fn().mockResolvedValue(0),
      };

      const containerRateModel = {
        create: jest.fn(),
        destroy: jest.fn().mockResolvedValue(0),
      };

      const logisticsRecord = {
        id: 9,
        status: 'Pending',
        purchaseContractId: 80,
        businessTransactionId: 700,
        selectedFreightId: null,
        update: jest.fn(function (vals: any) {
          Object.assign(this, vals);
          return Promise.resolve(this);
        }),
      };

      const testSequelize: any = {
        models: {},
        transaction: jest.fn((cb: any) => cb({ id: 'tx' })),
        query: jest.fn((sql: string) => {
          if (sql.includes("nextval('freight_quotes_no_seq')")) {
            fqSeq += 1;
            return Promise.resolve([{ nextval: String(fqSeq) }]);
          }
          return Promise.resolve([[]]);
        }),
      };

      const auditService = { writeLog: jest.fn().mockResolvedValue(undefined) };

      const paymentTermModel = {
        findByPk: jest.fn().mockResolvedValue({ id: 4, name: 'Net 30' }),
        findOne: jest.fn().mockResolvedValue(null),
      };

      const localService = new LogisticsService(
        { findByPk: jest.fn().mockResolvedValue(logisticsRecord) } as any,
        quoteModel as any,
        {} as any,
        quoteChargeModel as any,
        containerRateModel as any,
        {} as any,
        mockEnquiryModel,
        {} as any,
        {
          findByPk: jest.fn((id: number) =>
            Promise.resolve(shipmentRecords[id] || null),
          ),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        mockTransportEnquiryHiddenModel,
        {} as any,
        auditService as any,
        testSequelize,
        {} as any,
        {
          evaluate: jest.fn().mockResolvedValue({ freightRequired: true }),
        } as any,
        paymentTermModel as any,
      );

      return {
        localService,
        shipmentRecords,
        createdQuotes,
        createdCharges,
        quoteModel,
        quoteChargeModel,
        containerRateModel,
        auditService,
        logisticsRecord,
      };
    };

    it('auto-applies Freight Quote to all other selected Rail shipments from Shipments Management without copying IDs or quoteNumber', async () => {
      const {
        localService,
        shipmentRecords,
        createdQuotes,
        createdCharges,
      } = buildSyncTestHarness('rail');

      const result: any = await localService.createFreightQuote(
        9,
        {
          shipmentId: 101,
          quoteDate: '2026-06-01',
          currency: 'USD',
          wagonType: 'Covered Wagon',
          wagonCapacity: '60 MT',
          vehicleType: 'Covered Wagon',
          transitDays: 5,
          validityDate: '2026-06-20',
          paymentTermId: 4,
          remarks: 'Rail rate per rake',
          charges: [{ chargeName: 'Basic Freight', amount: 1500, displayOrder: 1 }],
          syncWorkflowSource: 'shipments_management',
          syncShipmentIds: [101, 102, 103],
        } as any,
        { userId: 42 },
        1,
      );

      expect(createdQuotes).toHaveLength(3);
      expect(createdQuotes.map((q) => q.shipmentId)).toEqual([101, 102, 103]);
      expect(new Set(createdQuotes.map((q) => q.quoteNumber)).size).toBe(3);
      expect(new Set(createdQuotes.map((q) => q.id)).size).toBe(3);

      expect(createdQuotes[1].wagonType).toBe('Covered Wagon');
      expect(createdQuotes[1].wagonCapacity).toBe('60 MT');
      expect(createdQuotes[1].freightAmount).toBe(1500);
      expect(createdQuotes[1].remarks).toBe('Rail rate per rake');
      expect(createdQuotes[1].paymentTermId).toBe(4);
      expect(createdQuotes[1].paymentTerms).toBe('Net 30');

      expect(createdCharges).toHaveLength(3);
      expect(createdCharges.map((c) => c.quoteId)).toEqual([501, 502, 503]);

      expect(shipmentRecords[102].update).toHaveBeenCalledWith(
        expect.objectContaining({
          logisticsId: 9,
          freightAllocationStatus: 'Yes',
          freight: 1500,
        }),
        expect.any(Object),
      );
      expect(shipmentRecords[103].update).toHaveBeenCalledWith(
        expect.objectContaining({
          logisticsId: 9,
          freightAllocationStatus: 'Yes',
          freight: 1500,
        }),
        expect.any(Object),
      );

      expect(result.syncSummary).toEqual({
        workflowSource: 'shipments_management',
        totalSelectedCount: 3,
        appliedCount: 2,
        syncedShipmentIds: [102, 103],
        skippedShipmentIds: [],
        failedShipments: [],
        failedCount: 0,
      });
    });

    it('syncs edited Rail Freight Quote updates across matching sibling quotes from Shipments Management', async () => {
      const {
        localService,
        quoteModel,
        quoteChargeModel,
        createdCharges,
      } = buildSyncTestHarness('Rail Freight / Wagon');

      const sourceQuote: any = {
        id: 501,
        logisticsId: 9,
        shipmentId: 101,
        sellerId: null,
        quoteNumber: 'FQ/2026/000011',
        quoteDate: '2026-06-01',
        freightAmount: 1500,
        currency: 'USD',
        wagonType: 'Covered Wagon',
        wagonCapacity: '60 MT',
        transitDays: 5,
        validityDate: '2026-06-20',
        paymentTermId: 4,
        remarks: 'Initial note',
        version: 1,
        isPreferred: false,
        isRejected: false,
        update: jest.fn(function (vals: any) {
          Object.assign(this, vals);
          return Promise.resolve(this);
        }),
        reload: jest.fn(function () {
          return Promise.resolve({
            ...this,
            toJSON: () => ({ ...this }),
          });
        }),
      };

      const siblingQuote102: any = {
        id: 502,
        logisticsId: 9,
        shipmentId: 102,
        sellerId: null,
        quoteNumber: 'FQ/2026/000012',
        quoteDate: '2026-06-01',
        freightAmount: 1500,
        currency: 'USD',
        wagonType: 'Covered Wagon',
        wagonCapacity: '60 MT',
        transitDays: 5,
        validityDate: '2026-06-20',
        paymentTermId: 4,
        remarks: 'Initial note',
        version: 1,
        isPreferred: false,
        isRejected: false,
        oneTimeCompletedEditUsed: false,
        charges: [{ chargeName: 'Basic Freight', amount: 1500, displayOrder: 1 }],
        update: jest.fn(function (vals: any) {
          Object.assign(this, vals);
          return Promise.resolve(this);
        }),
      };

      quoteModel.findOne.mockResolvedValue(sourceQuote);
      quoteChargeModel.findAll.mockResolvedValue([
        { chargeName: 'Basic Freight', amount: 1500, displayOrder: 1 },
      ]);
      quoteModel.findAll.mockResolvedValue([siblingQuote102]);

      const result: any = await localService.updateFreightQuote(
        9,
        501,
        {
          shipmentId: 101,
          quoteDate: '2026-06-02',
          currency: 'USD',
          wagonType: 'Flat Wagon',
          wagonCapacity: '60 MT',
          vehicleType: 'Flat Wagon',
          transitDays: 4,
          validityDate: '2026-06-25',
          paymentTermId: 4,
          remarks: 'Revised Rail rate',
          charges: [{ chargeName: 'Basic Freight', amount: 1850, displayOrder: 1 }],
          syncWorkflowSource: 'shipments_management',
          syncShipmentIds: [101, 102],
        } as any,
        { userId: 42 },
        1,
      );

      expect(sourceQuote.freightAmount).toBe(1850);
      expect(sourceQuote.version).toBe(2);

      expect(siblingQuote102.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wagonType: 'Flat Wagon',
          freightAmount: 1850,
          remarks: 'Revised Rail rate',
          version: 2,
          updatedBy: 42,
        }),
        expect.any(Object),
      );
      expect(siblingQuote102.quoteNumber).toBe('FQ/2026/000012');
      expect(siblingQuote102.shipmentId).toBe(102);

      expect(quoteChargeModel.destroy).toHaveBeenCalledWith({
        where: { quoteId: 502 },
        transaction: expect.any(Object),
      });
      expect(createdCharges.some((c) => c.quoteId === 502 && c.amount === 1850)).toBe(true);
      expect(result.syncSummary?.syncedShipmentIds).toEqual([102]);
    });

    it('does NOT auto-apply for non-Rail modes (Sea, Road, Bulk, Air) or single shipment or outside Shipments Management', async () => {
      for (const nonRailMode of ['sea', 'road', 'bulk', 'air', 'Courier']) {
        const harness = buildSyncTestHarness(nonRailMode);
        const res: any = await harness.localService.createFreightQuote(
          9,
          {
            shipmentId: 101,
            quoteDate: '2026-06-01',
            currency: 'USD',
            transitDays: 5,
            validityDate: '2026-06-20',
            charges: [{ chargeName: 'Ocean Freight', amount: 2000, displayOrder: 1 }],
            syncWorkflowSource: 'shipments_management',
            syncShipmentIds: [101, 102, 103],
          } as any,
          { userId: 42 },
          1,
        );
        expect(harness.createdQuotes).toHaveLength(1);
        expect(res.syncSummary).toBeUndefined();
      }

      // Single Rail shipment selected
      const singleHarness = buildSyncTestHarness('rail');
      const singleRes: any = await singleHarness.localService.createFreightQuote(
        9,
        {
          shipmentId: 101,
          quoteDate: '2026-06-01',
          currency: 'INR',
          transitDays: 3,
          validityDate: '2026-06-15',
          charges: [{ chargeName: 'Basic Freight', amount: 900, displayOrder: 1 }],
          syncWorkflowSource: 'shipments_management',
          syncShipmentIds: [101],
        } as any,
        { userId: 42 },
        1,
      );
      expect(singleHarness.createdQuotes).toHaveLength(1);
      expect(singleRes.syncSummary).toBeUndefined();

      // Outside Shipments Management (no syncWorkflowSource)
      const globalHarness = buildSyncTestHarness('rail');
      const globalRes: any = await globalHarness.localService.createFreightQuote(
        9,
        {
          shipmentId: 101,
          quoteDate: '2026-06-01',
          currency: 'INR',
          transitDays: 3,
          validityDate: '2026-06-15',
          charges: [{ chargeName: 'Basic Freight', amount: 900, displayOrder: 1 }],
          syncShipmentIds: [101, 102],
        } as any,
        { userId: 42 },
        1,
      );
      expect(globalHarness.createdQuotes).toHaveLength(1);
      expect(globalRes.syncSummary).toBeUndefined();
    });

    it('isolates per-shipment failures so source quote and other valid Rail siblings remain saved', async () => {
      const harness = buildSyncTestHarness('rail');
      harness.shipmentRecords[103].update.mockRejectedValueOnce(
        new Error('Simulated failure on shipment 103'),
      );
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result: any = await harness.localService.createFreightQuote(
          9,
          {
            shipmentId: 101,
            quoteDate: '2026-06-01',
            currency: 'USD',
            wagonType: 'Covered Wagon',
            wagonCapacity: '60 MT',
            transitDays: 5,
            validityDate: '2026-06-20',
            charges: [{ chargeName: 'Basic Freight', amount: 1500, displayOrder: 1 }],
            syncWorkflowSource: 'shipments_management',
            syncShipmentIds: [101, 102, 103],
          } as any,
          { userId: 42 },
          1,
        );

        expect(result.id).toBe(501);
        expect(harness.shipmentRecords[101].freightAllocationStatus).toBe('Yes');
        expect(harness.shipmentRecords[102].freightAllocationStatus).toBe('Yes');
        expect(result.syncSummary).toEqual({
          workflowSource: 'shipments_management',
          totalSelectedCount: 3,
          appliedCount: 1,
          syncedShipmentIds: [102],
          skippedShipmentIds: [],
          failedShipments: [
            {
              shipmentId: 103,
              message: 'Simulated failure on shipment 103',
            },
          ],
          failedCount: 1,
        });
      } finally {
        errSpy.mockRestore();
      }
    });
  });
});

