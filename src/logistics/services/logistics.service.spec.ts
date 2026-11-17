import { LogisticsService } from './logistics.service';

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
        freight_required: true,
        quantity: '500',
        place_of_loading: 'Nagpur',
        loading_country: 'India',
        delivery_place: 'Qingdao',
        purchase_date: '2026-11-17',
        created_at: new Date(),
        seller_name: 'Nagpur Farmers Ltd',
        buyer_name: 'Agricom Global',
        shipment_type_name: 'CFR',
        transport_mode: 'ROAD',
        business_reference: 'BR-999',
        product_name: 'Soybean',
        logistics_id: null,
        logistics_status: null,
        logistics_is_viewed: null,
      },
    ];

    mockSequelize.query
      .mockResolvedValueOnce([{ total: '1' }]) // countQuery
      .mockResolvedValueOnce(mockRows); // selectQuery

    const result = await service.findQueue({ tab: 'purchase-contracts', page: 1, limit: 10 }, 1, 12);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].enquiryNo).toBeNull();
    expect(result.data[0].purchaseContract.contractNumber).toBe('PC-EA.2632627');
    expect(result.data[0].isPurchaseContract).toBe(true);
    expect(result.data[0].sourceType).toBe('PurchaseContract');
    expect(result.data[0].incoterm).toBe('CFR');
    expect(result.data[0].origin).toBe('Nagpur');
    expect(result.data[0].destination).toBe('Qingdao');
    expect(mockEnquiryModel.findAndCountAll).not.toHaveBeenCalled();
  });

  it('should not contain non-existent columns (st.transport_mode, sc.delivery_place) in executed SQL query', async () => {
    mockSequelize.query
      .mockResolvedValueOnce([{ total: '0' }])
      .mockResolvedValueOnce([]);

    await service.findPurchaseContractsQueue({ page: 1, limit: 10 }, 1);

    expect(mockSequelize.query).toHaveBeenCalledTimes(2);
    const selectSql = mockSequelize.query.mock.calls[1][0];
    expect(selectSql).not.toContain('st.transport_mode');
    expect(selectSql).not.toContain('sc.delivery_place');
    expect(selectSql).toContain('COALESCE(log.transport_mode, sc.transport_mode, \'ROAD\') AS transport_mode');
    expect(selectSql).toContain('COALESCE(sc.destination_location_name, sc.port_of_discharge, sc.enquiry_destination) AS sc_delivery_place');
  });
});

