import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { ConversationMember } from '../models/conversation-member.model';
import { Conversation } from '../models/conversation.model';

@Injectable()
export class UnreadService {
  private readonly logger = new Logger(UnreadService.name);

  constructor(
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
  ) {}

  /**
   * Atomically increment unread message counters on new incoming message
   */
  async incrementCounters(
    conversationId: number,
    senderId: number,
    mentionedUserIds: number[] = [],
    isThread: boolean = false,
    transaction?: Transaction,
  ): Promise<void> {
    // 1. Increment unread message count for all non-sender members
    await this.memberRepository.increment('unreadMessagesCount', {
      by: 1,
      where: {
        conversationId,
        userId: { [Op.ne]: senderId },
      },
      transaction,
    });

    // 2. Increment mention counts if any users were tagged
    if (mentionedUserIds.length > 0) {
      await this.memberRepository.increment('unreadMentionsCount', {
        by: 1,
        where: {
          conversationId,
          userId: { [Op.in]: mentionedUserIds },
        },
        transaction,
      });
    }

    // 3. Increment thread counts if this was a thread reply
    if (isThread) {
      await this.memberRepository.increment('unreadThreadsCount', {
        by: 1,
        where: {
          conversationId,
          userId: { [Op.ne]: senderId },
        },
        transaction,
      });
    }
  }

  /**
   * Reset unread counts when a user opens/reads the conversation
   */
  async markRead(
    conversationId: number,
    userId: number,
    lastMessageId: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.memberRepository.update(
      {
        lastReadMessageId: lastMessageId,
        unreadMessagesCount: 0,
        unreadMentionsCount: 0,
        unreadThreadsCount: 0,
      },
      {
        where: { conversationId, userId },
        transaction,
      },
    );
  }

  /**
   * Get user total aggregated unread badges across all company channels
   */
  async getUserTotalUnread(userId: number, companyId: number): Promise<{
    totalUnreadMessages: number;
    totalUnreadMentions: number;
    totalUnreadThreads: number;
  }> {
    const memberships = await this.memberRepository.findAll({
      where: { userId },
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId, isArchived: false },
          attributes: ['id'],
        },
      ],
      attributes: ['unreadMessagesCount', 'unreadMentionsCount', 'unreadThreadsCount'],
    });

    let totalUnreadMessages = 0;
    let totalUnreadMentions = 0;
    let totalUnreadThreads = 0;

    for (const m of memberships) {
      totalUnreadMessages += m.unreadMessagesCount || 0;
      totalUnreadMentions += m.unreadMentionsCount || 0;
      totalUnreadThreads += m.unreadThreadsCount || 0;
    }

    return {
      totalUnreadMessages,
      totalUnreadMentions,
      totalUnreadThreads,
    };
  }

  /**
   * Get channel-by-channel unread counts for left sidebar rendering
   */
  async getSidebarUnreadBreakdown(userId: number, companyId: number) {
    const memberships = await this.memberRepository.findAll({
      where: { userId },
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { companyId, isArchived: false },
          attributes: ['id', 'name', 'type', 'entityType', 'entityId', 'updatedAt'],
        },
      ],
      attributes: [
        'conversationId',
        'isPinned',
        'isFavorite',
        'isHidden',
        'unreadMessagesCount',
        'unreadMentionsCount',
        'unreadThreadsCount',
        'lastReadMessageId',
      ],
      order: [
        ['isPinned', 'DESC'],
        ['isFavorite', 'DESC'],
      ],
    });

    return memberships.map((m) => ({
      conversationId: m.conversationId,
      conversation: m.conversation,
      isPinned: m.isPinned,
      isFavorite: m.isFavorite,
      isHidden: m.isHidden,
      unreadMessagesCount: m.unreadMessagesCount,
      unreadMentionsCount: m.unreadMentionsCount,
      unreadThreadsCount: m.unreadThreadsCount,
      lastReadMessageId: m.lastReadMessageId,
    }));
  }
}
