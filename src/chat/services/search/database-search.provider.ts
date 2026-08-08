import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ISearchProvider, SearchResult } from './search-provider.interface';
import { ChatSearchDto } from '../../dto/search.dto';
import { Message } from '../../models/message.model';
import { Conversation } from '../../models/conversation.model';
import { ConversationMember } from '../../models/conversation-member.model';
import { MessageAttachment } from '../../models/message-attachment.model';
import { MessageReaction } from '../../models/message-reaction.model';
import { MessagePin } from '../../models/message-pin.model';
import { MessageReadState } from '../../models/message-read-state.model';
import { User } from '../../../users/models/user.model';
import { Attachment } from '../../../attachments/models/attachment.model';
import { PolicyService } from '../policy.service';

@Injectable()
export class DatabaseSearchProvider implements ISearchProvider {
  constructor(
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(MessageAttachment)
    private readonly messageAttachmentRepository: typeof MessageAttachment,
    @InjectModel(Attachment)
    private readonly attachmentRepository: typeof Attachment,
    private readonly policyService: PolicyService,
  ) {}

  async searchMessages(
    companyId: number,
    accessibleConversationIds: number[],
    dto: ChatSearchDto,
    userId: number,
  ): Promise<SearchResult<any>> {
    const limit = Math.min(dto.limit || 50, 100);
    const offset = dto.offset || 0;

    const where: any = {
      isDeleted: false,
    };

    // Filter conversations accessible to this user
    if (dto.conversationId) {
      if (!accessibleConversationIds.includes(dto.conversationId)) {
        return { items: [], total: 0, limit, offset };
      }
      where.conversationId = dto.conversationId;
    } else {
      where.conversationId = { [Op.in]: accessibleConversationIds };
    }

    // Text query
    if (dto.query && dto.query.trim()) {
      where.content = { [Op.iLike]: `%${dto.query.trim()}%` };
    }

    // Sender filter
    if (dto.senderId) {
      where.senderId = dto.senderId;
    }

    // Type filter
    if (dto.messageType) {
      where.type = dto.messageType;
    }

    // Date filters
    if (dto.dateFrom || dto.dateTo) {
      where.createdAt = {};
      if (dto.dateFrom) {
        where.createdAt[Op.gte] = new Date(dto.dateFrom);
      }
      if (dto.dateTo) {
        where.createdAt[Op.lte] = new Date(dto.dateTo);
      }
    }

    const include: any[] = [
      { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
      { model: MessageAttachment, as: 'attachments' },
      { model: MessageReaction, as: 'reactions' },
      {
        model: Conversation,
        as: 'conversation',
        where: { companyId },
        attributes: ['id', 'name', 'type', 'entityType', 'entityId'],
      },
    ];

    if (dto.isPinned) {
      include.push({ model: MessagePin, as: 'pins', required: true });
    }

    if (dto.isStarred) {
      include.push({
        model: MessageReadState,
        as: 'readStates',
        where: { userId, isStarred: true },
        required: true,
      });
    }

    const { rows, count } = await this.messageRepository.findAndCountAll({
      where,
      include,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    return {
      items: rows,
      total: count,
      limit,
      offset,
    };
  }

  async getAccessibleConversationIds(userId: number, companyId: number, userType: string = 'standard'): Promise<number[]> {
    return this.policyService.getAccessibleConversationIds(userId, companyId, userType);
  }

  async searchConversations(
    companyId: number,
    userId: number,
    userType: string,
    query: string,
    limit: number = 20,
  ): Promise<any[]> {
    const accessibleConversationIds = await this.getAccessibleConversationIds(userId, companyId, userType);

    if (accessibleConversationIds.length === 0) {
      return [];
    }

    return this.conversationRepository.findAll({
      where: {
        id: { [Op.in]: accessibleConversationIds },
        companyId,
        isArchived: false,
        showInSearch: true,
        name: { [Op.iLike]: `%${query.trim()}%` },
      },
      limit,
      order: [['updatedAt', 'DESC']],
    });
  }

  async searchAttachments(
    companyId: number,
    accessibleConversationIds: number[],
    query?: string,
    mimeType?: string,
    limit: number = 50,
  ): Promise<any[]> {
    if (accessibleConversationIds.length === 0) {
      return [];
    }

    const whereAttachment: any = {};
    if (query && query.trim()) {
      whereAttachment.originalName = { [Op.iLike]: `%${query.trim()}%` };
    }
    if (mimeType) {
      whereAttachment.mimeType = { [Op.iLike]: `${mimeType}%` };
    }

    const messageAttachments = await this.messageAttachmentRepository.findAll({
      include: [
        {
          model: Message,
          as: 'message',
          where: {
            conversationId: { [Op.in]: accessibleConversationIds },
            isDeleted: false,
          },
          include: [
            { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
            {
              model: Conversation,
              as: 'conversation',
              where: { companyId },
              attributes: ['id', 'name', 'type'],
            },
          ],
        },
        {
          model: Attachment,
          as: 'attachment',
          where: Object.keys(whereAttachment).length > 0 ? whereAttachment : undefined,
        },
      ],
      limit,
      order: [['createdAt', 'DESC']],
    });

    return messageAttachments;
  }
}
