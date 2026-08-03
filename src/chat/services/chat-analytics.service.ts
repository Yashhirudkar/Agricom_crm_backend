import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col, literal } from 'sequelize';
import { Message } from '../models/message.model';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { User } from '../../users/models/user.model';
import { Attachment } from '../../attachments/models/attachment.model';

@Injectable()
export class ChatAnalyticsService {
  private readonly logger = new Logger(ChatAnalyticsService.name);

  constructor(
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(User)
    private readonly userRepository: typeof User,
  ) {}

  /**
   * Executive overview of company chat engagement
   */
  async getOverview(companyId: number, days: number = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const totalConversations = await this.conversationRepository.count({
      where: { companyId, isArchived: false },
    });

    const totalMessages = await this.messageRepository.count({
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId },
          attributes: [],
        },
      ],
      where: {
        createdAt: { [Op.gte]: sinceDate },
        isDeleted: false,
      },
    });

    const activeUsersResult = await this.messageRepository.findAll({
      attributes: [[fn('DISTINCT', col('senderId')), 'senderId']],
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId },
          attributes: [],
        },
      ],
      where: {
        createdAt: { [Op.gte]: sinceDate },
        senderId: { [Op.ne]: null },
      },
      raw: true,
    });

    return {
      periodDays: days,
      totalChannels: totalConversations,
      totalMessagesSent: totalMessages,
      activeUsersCount: activeUsersResult.length,
    };
  }

  /**
   * Top channels by message volume
   */
  async getTopChannels(companyId: number, limit: number = 10) {
    const results = await this.messageRepository.findAll({
      attributes: [
        'conversationId',
        [fn('COUNT', col('Message.id')), 'messageCount'],
      ],
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId },
          attributes: ['id', 'name', 'type'],
        },
      ],
      where: { isDeleted: false },
      group: ['conversationId', 'conversation.id'],
      order: [[literal('"messageCount"'), 'DESC']],
      limit,
      raw: true,
      nest: true,
    });

    return results;
  }

  /**
   * Daily message frequency breakdown
   */
  async getDailyVolume(companyId: number, days: number = 14) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const dailyData = await this.messageRepository.findAll({
      attributes: [
        [fn('DATE', col('Message.createdAt')), 'date'],
        [fn('COUNT', col('Message.id')), 'count'],
      ],
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId },
          attributes: [],
        },
      ],
      where: {
        createdAt: { [Op.gte]: sinceDate },
        isDeleted: false,
      },
      group: [fn('DATE', col('Message.createdAt'))],
      order: [[fn('DATE', col('Message.createdAt')), 'ASC']],
      raw: true,
    });

    return dailyData;
  }
}
