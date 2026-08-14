import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { Message } from '../models/message.model';
import { Op } from 'sequelize';

@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
  ) {}

  /**
   * Updates conversation activity and last message summary upon a new message
   */
  async recordNewMessage(conversationId: number, message: Message): Promise<void> {
    try {
      await this.conversationModel.update(
        {
          updatedAt: new Date(),
        },
        {
          where: { id: conversationId },
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to update conversation summary for conversation ${conversationId}: ${err.message}`,
      );
    }
  }

  /**
   * Updates conversation activity and updatedAt timestamp inside a transaction
   */
  async updateActivity(conversationId: number, transaction?: any): Promise<void> {
    try {
      await this.conversationModel.update(
        {
          updatedAt: new Date(),
        },
        {
          where: { id: conversationId },
          transaction,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to update conversation activity for conversation ${conversationId}: ${err.message}`,
      );
    }
  }

  /**
   * Calculates unread message count for a specific member in a conversation
   */
  async getUnreadCount(conversationId: number, userId: number): Promise<number> {
    try {
      const member = await this.memberModel.findOne({
        where: { conversationId, userId },
      });

      if (!member) return 0;

      const lastReadId = member.lastReadMessageId || 0;

      const unreadCount = await this.messageModel.count({
        where: {
          conversationId,
          id: { [Op.gt]: lastReadId },
          isDeleted: false,
        },
      });

      return unreadCount;
    } catch (err) {
      this.logger.error(`Error calculating unread count: ${err.message}`);
      return 0;
    }
  }
}
