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
        purchase_date: '2026-11-17',
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
      },
    ];

    mockSequelize.query.mockResolvedValueOnce(mockRows);

    const result = await service.findQueue({ tab: 'purchase-contracts', page: 1, limit: 10 }, 1, 12);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].enquiryNo).toBeNull();
    expect(result.data[0].purchaseContract.contractNumber).toBe('PC-EA.2632627');
    expect(result.data[0].isPurchaseContract).toBe(true);
    expect(result.data[0].sourceType).toBe('PurchaseContract');
    expect(result.data[0].incoterm).toBe('EXW');
    expect(result.data[0].origin).toBe('Nagpur, India');
    expect(result.data[0].destination).toBe('Qingdao');
    expect(mockEnquiryModel.findAndCountAll).not.toHaveBeenCalled();
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
});

