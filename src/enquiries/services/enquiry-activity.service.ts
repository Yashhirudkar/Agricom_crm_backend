import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { OnEvent } from '@nestjs/event-emitter';
import { EnquiryActivityLog, EnquiryActivityType } from '../models/enquiry-activity-log.model';
import { Enquiry } from '../models/enquiry.model';
import { User } from '../../users/models/user.model';
import { Role } from '../../rbac/models/role.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';

export interface CreateEnquiryActivityDto {
  enquiryId: string;
  activityType: EnquiryActivityType | string;
  message?: string | null;
  bidAmount?: number | null;
  offerAmount?: number | null;
  currency?: string | null;
  changedByUserId?: number | null;
  whatsappMessageId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: Date;
}

export interface ActivityQueryOptions {
  limit?: number;
  offset?: number;
  before?: number;
}

@Injectable()
export class EnquiryActivityService {
  private readonly logger = new Logger(EnquiryActivityService.name);

  constructor(
    @InjectModel(EnquiryActivityLog)
    private readonly activityModel: typeof EnquiryActivityLog,
    @InjectModel(Enquiry)
    private readonly enquiryModel: typeof Enquiry,
  ) {}

  /**
   * Reusable central method to insert any enquiry activity.
   * Never updates records — ALWAYS INSERTS.
   */
  async createActivity(dto: CreateEnquiryActivityDto): Promise<EnquiryActivityLog> {
    try {
      const record = await this.activityModel.create({
        enquiryId: dto.enquiryId,
        activityType: dto.activityType,
        message: dto.message || null,
        bidAmount: dto.bidAmount != null ? Number(dto.bidAmount) : null,
        offerAmount: dto.offerAmount != null ? Number(dto.offerAmount) : null,
        currency: dto.currency || null,
        changedByUserId: dto.changedByUserId || null,
        whatsappMessageId: dto.whatsappMessageId || null,
        metadata: dto.metadata || null,
        createdAt: dto.createdAt || new Date(),
      } as any);

      return record;
    } catch (err: any) {
      this.logger.error(
        `Failed to create activity log for enquiry ${dto.enquiryId}: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  /**
   * Automatically log ENQUIRY_CREATED as the first timeline event.
   */
  async logEnquiryCreated(
    enquiry: Enquiry,
    details?: {
      productName?: string;
      partnerName?: string;
      creatorName?: string;
      quantity?: number | string;
      user?: any;
    },
  ): Promise<EnquiryActivityLog> {
    return this.createActivity({
      enquiryId: enquiry.id,
      activityType: EnquiryActivityType.ENQUIRY_CREATED,
      bidAmount: enquiry.buyingInterest != null ? Number(enquiry.buyingInterest) : null,
      offerAmount: enquiry.offerAmount != null ? Number(enquiry.offerAmount) : null,
      currency: enquiry.bidCurrency || 'USD',
      changedByUserId: details?.user?.userId || enquiry.createdBy || null,
      metadata: {
        enquiryNo: enquiry.enquiryNo,
        productName: details?.productName || (enquiry.product as any)?.name || 'Product',
        partnerName: details?.partnerName || (enquiry.partner as any)?.entityName || 'Partner',
        creatorName: details?.creatorName || details?.user?.name || (enquiry.creator as any)?.name || 'Admin',
        quantity: details?.quantity ?? enquiry.quantity,
        bid: enquiry.buyingInterest != null ? String(enquiry.buyingInterest) : null,
        offer: enquiry.offerAmount != null ? String(enquiry.offerAmount) : null,
        currency: enquiry.bidCurrency || 'USD',
      },
      createdAt: enquiry.createdAt || new Date(),
    });
  }

  /**
   * Compare old vs new Bid & Offer and log activity if changed.
   * Handles PRICE_UPDATED (both changed), BID_UPDATED, and OFFER_UPDATED.
   * Does NOT log if neither changed.
   */
  async logPriceChange(
    enquiryId: string,
    oldData: {
      buyingInterest?: any;
      offerAmount?: any;
      bidCurrency?: string;
    },
    newData: {
      buyingInterest?: any;
      offerAmount?: any;
      bidCurrency?: string;
    },
    user?: any,
  ): Promise<EnquiryActivityLog | null> {
    const oldBid = oldData.buyingInterest != null && oldData.buyingInterest !== '' ? Number(oldData.buyingInterest) : null;
    const newBid = newData.buyingInterest !== undefined
      ? (newData.buyingInterest != null && newData.buyingInterest !== '' ? Number(newData.buyingInterest) : null)
      : oldBid;

    const oldOffer = oldData.offerAmount != null && oldData.offerAmount !== '' ? Number(oldData.offerAmount) : null;
    const newOffer = newData.offerAmount !== undefined
      ? (newData.offerAmount != null && newData.offerAmount !== '' ? Number(newData.offerAmount) : null)
      : oldOffer;

    const bidChanged = oldBid !== newBid;
    const offerChanged = oldOffer !== newOffer;

    if (!bidChanged && !offerChanged) {
      return null; // Do NOT create activity if values remain unchanged
    }

    const currency = newData.bidCurrency || oldData.bidCurrency || 'USD';

    let activityType: EnquiryActivityType;
    if (bidChanged && offerChanged) {
      activityType = EnquiryActivityType.PRICE_UPDATED;
    } else if (bidChanged) {
      activityType = EnquiryActivityType.BID_UPDATED;
    } else {
      activityType = EnquiryActivityType.OFFER_UPDATED;
    }

    return this.createActivity({
      enquiryId,
      activityType,
      bidAmount: newBid,
      offerAmount: newOffer,
      currency,
      changedByUserId: user?.userId || null,
      metadata: {
        oldBid,
        newBid,
        oldOffer,
        newOffer,
        bidChanged,
        offerChanged,
        currency,
        updatedByName: user?.name,
      },
    });
  }

  /**
   * Log an outgoing WhatsApp message.
   */
  async logWhatsAppSent(
    enquiryId: string,
    message: string,
    whatsappMessageId?: string | null,
    user?: any,
    metadata?: Record<string, any>,
  ): Promise<EnquiryActivityLog> {
    return this.createActivity({
      enquiryId,
      activityType: EnquiryActivityType.WHATSAPP_SENT,
      message,
      whatsappMessageId: whatsappMessageId || null,
      changedByUserId: user?.userId || null,
      metadata: {
        ...metadata,
        senderName: user?.name,
      },
    });
  }

  /**
   * Log an incoming customer WhatsApp reply.
   */
  async logWhatsAppReceived(
    enquiryId: string,
    message: string,
    whatsappMessageId?: string | null,
    metadata?: Record<string, any>,
  ): Promise<EnquiryActivityLog> {
    return this.createActivity({
      enquiryId,
      activityType: EnquiryActivityType.WHATSAPP_RECEIVED,
      message,
      whatsappMessageId: whatsappMessageId || null,
      metadata,
    });
  }

  /**
   * Log a manual follow-up message.
   */
  async logFollowUp(
    enquiryId: string,
    message: string,
    user?: any,
    metadata?: Record<string, any>,
  ): Promise<EnquiryActivityLog> {
    return this.createActivity({
      enquiryId,
      activityType: EnquiryActivityType.FOLLOW_UP,
      message,
      changedByUserId: user?.userId || null,
      metadata: {
        ...metadata,
        authorName: user?.name,
      },
    });
  }

  /**
   * Event listener for outgoing WhatsApp messages sent for enquiries.
   */
  @OnEvent('enquiry.whatsapp.sent')
  async handleWhatsAppSentEvent(data: {
    enquiryId: string;
    message: string;
    whatsappMessageId?: string | null;
    recipient?: string;
    template?: string;
  }) {
    if (!data.enquiryId || !data.message) return;
    try {
      await this.logWhatsAppSent(
        data.enquiryId,
        data.message,
        data.whatsappMessageId,
        null,
        { recipient: data.recipient, template: data.template },
      );
    } catch (err: any) {
      this.logger.error(`Error in handleWhatsAppSentEvent: ${err?.message}`);
    }
  }

  /**
   * Event listener for incoming customer WhatsApp replies.
   */
  @OnEvent('whatsapp.message.received')
  async handleIncomingWhatsAppEvent(data: {
    text: string;
    senderJid?: string;
    messageId?: string;
    stanzaId?: string;
    quotedText?: string;
    timestamp?: Date;
  }) {
    try {
      if (!data.text) return;
      const textToSearch = `${data.quotedText || ''} ${data.text}`;
      const match = textToSearch.match(/ENQ-[A-Za-z0-9-]+/i);
      let enquiry: Enquiry | null = null;
      if (match) {
        enquiry = await this.enquiryModel.findOne({
          where: { enquiryNo: match[0].toUpperCase() },
        });
      }

      if (!enquiry && data.stanzaId) {
        const sentLog = await this.activityModel.findOne({
          where: {
            activityType: EnquiryActivityType.WHATSAPP_SENT,
            whatsappMessageId: data.stanzaId,
          },
        });
        if (sentLog) {
          enquiry = await this.enquiryModel.findByPk(sentLog.enquiryId);
        }
      }

      if (enquiry) {
        await this.logWhatsAppReceived(enquiry.id, data.text, data.messageId, {
          senderJid: data.senderJid,
          quotedText: data.quotedText,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in handleIncomingWhatsAppEvent: ${err?.message}`);
    }
  }

  /**
   * Event listener for partner follow-ups related to enquiries.
   */
  @OnEvent('enquiry.followup.created')
  async handleFollowUpCreatedEvent(data: {
    enquiryId: string;
    dto: any;
    followUp: any;
    user: any;
  }) {
    if (!data.enquiryId) return;
    try {
      const message = [data.dto?.buyerRemark, data.dto?.ourResponse].filter(Boolean).join('\n\n');
      await this.createActivity({
        enquiryId: data.enquiryId,
        activityType: EnquiryActivityType.FOLLOW_UP,
        message,
        changedByUserId: data.user?.userId || null,
        metadata: {
          buyerRemark: data.dto?.buyerRemark,
          ourResponse: data.dto?.ourResponse,
          communicationType: data.dto?.communicationType,
          status: data.dto?.status,
          nextFollowupDate: data.dto?.nextFollowupDate,
          partnerFollowUpId: data.followUp?.id,
          authorName: data.user?.name,
        },
        createdAt: data.followUp?.createdAt || new Date(),
      });
    } catch (err: any) {
      this.logger.error(`Error in handleFollowUpCreatedEvent: ${err?.message}`);
    }
  }

  /**
   * Fetch activity timeline in chronological order (ASC, newest at bottom).
   * Supports loading latest 50 activities initially, and lazy loading older activities on scroll.
   */
  async getActivityTimeline(enquiryId: string, options?: ActivityQueryOptions): Promise<any[]> {
    const limit = options?.limit && Number(options.limit) > 0 ? Number(options.limit) : 50;
    const beforeId = options?.before ? Number(options.before) : null;

    const where: any = { enquiryId };
    if (beforeId) {
      where.id = { [Op.lt]: beforeId };
    }

    // Fetch up to limit items ordered DESC to get the latest/relevant window
    const records = await this.activityModel.findAll({
      where,
      limit,
      order: [['id', 'DESC']],
      include: [
        {
          model: User,
          as: 'changedBy',
          attributes: ['id', 'name', 'avatarUrl'],
          required: false,
          include: [
            {
              model: Role,
              attributes: ['name'],
              through: { attributes: [] },
              required: false,
            },
          ],
        },
      ],
    });

    // If there are no activities at all for this enquiry, synthesize ENQUIRY_CREATED
    if (records.length === 0 && !beforeId) {
      const enquiry = await this.enquiryModel.findByPk(enquiryId, {
        include: [
          { model: Product, attributes: ['id', 'name'] },
          { model: Partner, as: 'partner', attributes: ['id', 'entityName'] },
          { model: User, as: 'creator', attributes: ['id', 'name'] },
        ],
      });

      if (enquiry) {
        const createdLog = await this.logEnquiryCreated(enquiry, {
          productName: (enquiry.product as any)?.name,
          partnerName: (enquiry.partner as any)?.entityName,
          creatorName: (enquiry.creator as any)?.name,
          quantity: enquiry.quantity,
        });

        const fullLog = await this.activityModel.findByPk(createdLog.id, {
          include: [
            {
              model: User,
              as: 'changedBy',
              attributes: ['id', 'name', 'avatarUrl'],
              include: [{ model: Role, attributes: ['name'], through: { attributes: [] } }],
            },
          ],
        });

        if (fullLog) {
          records.push(fullLog);
        }
      }
    }

    // Sort ASC (oldest at top, newest at bottom like WhatsApp chat)
    records.sort((a, b) => Number(a.id) - Number(b.id));

    return records.map((r) => this.formatActivity(r));
  }

  /**
   * Format activity model into consistent JSON payload matching specification.
   */
  private formatActivity(record: EnquiryActivityLog): any {
    const raw = record.toJSON ? record.toJSON() : record;
    const changedByUser = (record as any).changedBy;

    return {
      id: Number(raw.id),
      enquiryId: raw.enquiryId,
      type: raw.activityType,
      activityType: raw.activityType,
      message: raw.message,
      bidAmount: raw.bidAmount != null ? Number(raw.bidAmount) : null,
      offerAmount: raw.offerAmount != null ? Number(raw.offerAmount) : null,
      currency: raw.currency || 'USD',
      changedByUserId: raw.changedByUserId,
      changedBy: changedByUser
        ? {
            id: changedByUser.id,
            name: changedByUser.name,
            avatar: changedByUser.avatarUrl,
            role: changedByUser.roles?.[0]?.name || 'User',
          }
        : raw.metadata?.creatorName || raw.metadata?.updatedByName || raw.metadata?.authorName
        ? {
            id: raw.changedByUserId,
            name: raw.metadata.creatorName || raw.metadata.updatedByName || raw.metadata.authorName,
            role: 'User',
          }
        : null,
      whatsappMessageId: raw.whatsappMessageId,
      metadata: raw.metadata || {},
      createdAt: raw.createdAt,
    };
  }

  /**
   * Get negotiation history for Bid and Offer (up to 10 latest records each, latest first).
   */
  async getPriceHistory(enquiryId: string): Promise<{
    bidHistory: Array<{ amount: number; currency: string; createdAt: Date }>;
    offerHistory: Array<{ amount: number; currency: string; createdAt: Date }>;
  }> {
    const enquiry = await this.enquiryModel.findByPk(enquiryId);
    if (!enquiry) {
      throw new NotFoundException(`Enquiry #${enquiryId} not found`);
    }

    const defaultCurrency = enquiry.bidCurrency || 'USD';

    // Fetch activities related to price creation and updates, ordered DESC (latest first)
    const records = await this.activityModel.findAll({
      where: {
        enquiryId,
        activityType: {
          [Op.in]: [
            EnquiryActivityType.ENQUIRY_CREATED,
            EnquiryActivityType.PRICE_UPDATED,
            EnquiryActivityType.BID_UPDATED,
            EnquiryActivityType.OFFER_UPDATED,
          ],
        },
      },
      order: [['id', 'DESC']],
      limit: 50,
    });

    const bidHistory: Array<{ amount: number; currency: string; createdAt: Date }> = [];
    const offerHistory: Array<{ amount: number; currency: string; createdAt: Date }> = [];

    let lastBidAmount: number | null = null;
    let lastOfferAmount: number | null = null;

    for (const record of records) {
      const type = record.activityType;
      const currency = record.currency || defaultCurrency;

      // Bid history entry
      if (
        (type === EnquiryActivityType.ENQUIRY_CREATED ||
          type === EnquiryActivityType.PRICE_UPDATED ||
          type === EnquiryActivityType.BID_UPDATED) &&
        record.bidAmount != null &&
        bidHistory.length < 10
      ) {
        const amt = Number(record.bidAmount);
        if (amt !== lastBidAmount) {
          bidHistory.push({
            amount: amt,
            currency,
            createdAt: record.createdAt,
          });
          lastBidAmount = amt;
        }
      }

      // Offer history entry
      if (
        (type === EnquiryActivityType.ENQUIRY_CREATED ||
          type === EnquiryActivityType.PRICE_UPDATED ||
          type === EnquiryActivityType.OFFER_UPDATED) &&
        record.offerAmount != null &&
        offerHistory.length < 10
      ) {
        const amt = Number(record.offerAmount);
        if (amt !== lastOfferAmount) {
          offerHistory.push({
            amount: amt,
            currency,
            createdAt: record.createdAt,
          });
          lastOfferAmount = amt;
        }
      }
    }

    // Fallback: if bidHistory is empty but enquiry currently has buyingInterest
    if (bidHistory.length === 0 && enquiry.buyingInterest != null && !isNaN(Number(enquiry.buyingInterest))) {
      bidHistory.push({
        amount: Number(enquiry.buyingInterest),
        currency: defaultCurrency,
        createdAt: enquiry.updatedAt || enquiry.createdAt || new Date(),
      });
    }

    // Fallback: if offerHistory is empty but enquiry currently has offerAmount
    if (offerHistory.length === 0 && enquiry.offerAmount != null) {
      offerHistory.push({
        amount: Number(enquiry.offerAmount),
        currency: defaultCurrency,
        createdAt: enquiry.updatedAt || enquiry.createdAt || new Date(),
      });
    }

    return {
      bidHistory,
      offerHistory,
    };
  }

}
