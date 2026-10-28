import { EnquiryActivityService } from './enquiry-activity.service';
import { EnquiryActivityType } from '../models/enquiry-activity-log.model';

describe('EnquiryActivityService', () => {
  let service: EnquiryActivityService;
  let mockActivityModel: any;
  let mockEnquiryModel: any;

  beforeEach(() => {
    mockActivityModel = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 101, ...dto, toJSON: () => ({ id: 101, ...dto }) })),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findByPk: jest.fn().mockResolvedValue(null),
    };

    mockEnquiryModel = {
      findByPk: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
    };

    service = new EnquiryActivityService(mockActivityModel, mockEnquiryModel);
  });

  describe('logEnquiryCreated', () => {
    it('creates ENQUIRY_CREATED activity with product, partner, bid, offer, and creator', async () => {
      const enquiry: any = {
        id: 'enq-uuid-1',
        enquiryNo: 'ENQ-000001',
        buyingInterest: 23,
        offerAmount: 21,
        bidCurrency: 'EUR',
        quantity: 100,
        createdAt: new Date('2026-10-27T14:15:00Z'),
      };

      const result = await service.logEnquiryCreated(enquiry, {
        productName: 'BLACK MUSTARD',
        partnerName: 'BAK ROL',
        creatorName: 'Agricom Super Admin',
      });

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enquiryId: 'enq-uuid-1',
          activityType: EnquiryActivityType.ENQUIRY_CREATED,
          bidAmount: 23,
          offerAmount: 21,
          currency: 'EUR',
          metadata: expect.objectContaining({
            productName: 'BLACK MUSTARD',
            partnerName: 'BAK ROL',
            creatorName: 'Agricom Super Admin',
          }),
        }),
      );
      expect(result.activityType).toBe(EnquiryActivityType.ENQUIRY_CREATED);
    });
  });

  describe('logPriceChange', () => {
    it('logs PRICE_UPDATED when both Bid and Offer change', async () => {
      const oldData = { buyingInterest: 23, offerAmount: 21, bidCurrency: 'EUR' };
      const newData = { buyingInterest: 25, offerAmount: 22, bidCurrency: 'EUR' };

      await service.logPriceChange('enq-uuid-1', oldData, newData, { userId: 5, name: 'Admin' });

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enquiryId: 'enq-uuid-1',
          activityType: EnquiryActivityType.PRICE_UPDATED,
          bidAmount: 25,
          offerAmount: 22,
          currency: 'EUR',
          metadata: expect.objectContaining({
            oldBid: 23,
            newBid: 25,
            oldOffer: 21,
            newOffer: 22,
          }),
        }),
      );
    });

    it('logs BID_UPDATED when only Bid changes', async () => {
      const oldData = { buyingInterest: 23, offerAmount: 21, bidCurrency: 'EUR' };
      const newData = { buyingInterest: 25, offerAmount: 21, bidCurrency: 'EUR' };

      await service.logPriceChange('enq-uuid-1', oldData, newData);

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: EnquiryActivityType.BID_UPDATED,
          bidAmount: 25,
          offerAmount: 21,
        }),
      );
    });

    it('logs OFFER_UPDATED when only Offer changes', async () => {
      const oldData = { buyingInterest: 23, offerAmount: 21, bidCurrency: 'EUR' };
      const newData = { buyingInterest: 23, offerAmount: 22, bidCurrency: 'EUR' };

      await service.logPriceChange('enq-uuid-1', oldData, newData);

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: EnquiryActivityType.OFFER_UPDATED,
          bidAmount: 23,
          offerAmount: 22,
        }),
      );
    });

    it('returns null and does not log if prices did not change', async () => {
      const oldData = { buyingInterest: 23, offerAmount: 21, bidCurrency: 'EUR' };
      const newData = { buyingInterest: 23, offerAmount: 21, bidCurrency: 'EUR' };

      const result = await service.logPriceChange('enq-uuid-1', oldData, newData);

      expect(result).toBeNull();
      expect(mockActivityModel.create).not.toHaveBeenCalled();
    });
  });

  describe('logWhatsAppSent and logWhatsAppReceived', () => {
    it('logs WHATSAPP_SENT with the exact message', async () => {
      await service.logWhatsAppSent('enq-uuid-1', 'Hello BAK ROL,\nWe have created your enquiry.');

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: EnquiryActivityType.WHATSAPP_SENT,
          message: 'Hello BAK ROL,\nWe have created your enquiry.',
        }),
      );
    });

    it('logs WHATSAPP_RECEIVED for incoming customer reply', async () => {
      await service.logWhatsAppReceived('enq-uuid-1', 'Can you reduce price?\nOffer 20 EUR.');

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: EnquiryActivityType.WHATSAPP_RECEIVED,
          message: 'Can you reduce price?\nOffer 20 EUR.',
        }),
      );
    });
  });

  describe('logFollowUp', () => {
    it('logs FOLLOW_UP message', async () => {
      await service.logFollowUp('enq-uuid-1', 'Customer requested better rate.\nWill discuss tomorrow.', {
        userId: 1,
        name: 'Agricom Super Admin',
      });

      expect(mockActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: EnquiryActivityType.FOLLOW_UP,
          message: 'Customer requested better rate.\nWill discuss tomorrow.',
          changedByUserId: 1,
        }),
      );
    });
  });

  describe('getActivityTimeline', () => {
    it('returns activities in chronological ASC order', async () => {
      mockActivityModel.findAll.mockResolvedValue([
        { id: 2, activityType: 'WHATSAPP_SENT', enquiryId: 'enq-uuid-1', toJSON: () => ({ id: 2, activityType: 'WHATSAPP_SENT', enquiryId: 'enq-uuid-1' }) },
        { id: 1, activityType: 'ENQUIRY_CREATED', enquiryId: 'enq-uuid-1', toJSON: () => ({ id: 1, activityType: 'ENQUIRY_CREATED', enquiryId: 'enq-uuid-1' }) },
      ]);

      const timeline = await service.getActivityTimeline('enq-uuid-1');

      expect(timeline).toHaveLength(2);
      expect(timeline[0].id).toBe(1);
      expect(timeline[0].type).toBe('ENQUIRY_CREATED');
      expect(timeline[1].id).toBe(2);
      expect(timeline[1].type).toBe('WHATSAPP_SENT');
    });
  });

  describe('getPriceHistory', () => {
    it('returns bidHistory and offerHistory sorted latest first', async () => {
      mockEnquiryModel.findByPk.mockResolvedValue({
        id: 'enq-uuid-1',
        bidCurrency: 'EUR',
      });

      mockActivityModel.findAll.mockResolvedValue([
        {
          id: 4,
          activityType: EnquiryActivityType.PRICE_UPDATED,
          bidAmount: 12112,
          offerAmount: 1212,
          currency: 'EUR',
          createdAt: new Date('2026-10-27T15:10:00Z'),
        },
        {
          id: 3,
          activityType: EnquiryActivityType.BID_UPDATED,
          bidAmount: 11500,
          offerAmount: null,
          currency: 'EUR',
          createdAt: new Date('2026-10-27T14:25:00Z'),
        },
        {
          id: 2,
          activityType: EnquiryActivityType.OFFER_UPDATED,
          bidAmount: null,
          offerAmount: 1150,
          currency: 'EUR',
          createdAt: new Date('2026-10-27T14:20:00Z'),
        },
        {
          id: 1,
          activityType: EnquiryActivityType.ENQUIRY_CREATED,
          bidAmount: 10000,
          offerAmount: 1000,
          currency: 'EUR',
          createdAt: new Date('2026-10-27T09:15:00Z'),
        },
      ]);

      const result = await service.getPriceHistory('enq-uuid-1');

      expect(result.bidHistory).toHaveLength(3);
      expect(result.bidHistory[0].amount).toBe(12112);
      expect(result.bidHistory[1].amount).toBe(11500);
      expect(result.bidHistory[2].amount).toBe(10000);

      expect(result.offerHistory).toHaveLength(3);
      expect(result.offerHistory[0].amount).toBe(1212);
      expect(result.offerHistory[1].amount).toBe(1150);
      expect(result.offerHistory[2].amount).toBe(1000);
    });

    it('returns empty lists if no history exists and enquiry has no prices', async () => {
      mockEnquiryModel.findByPk.mockResolvedValue({
        id: 'enq-uuid-empty',
        bidCurrency: 'USD',
        buyingInterest: null,
        offerAmount: null,
      });
      mockActivityModel.findAll.mockResolvedValue([]);

      const result = await service.getPriceHistory('enq-uuid-empty');

      expect(result.bidHistory).toEqual([]);
      expect(result.offerHistory).toEqual([]);
    });
  });

});
