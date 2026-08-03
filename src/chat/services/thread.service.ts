import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Message } from '../models/message.model';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { MessageAttachment } from '../models/message-attachment.model';
import { MessageMention } from '../models/message-mention.model';
import { MessageReaction } from '../models/message-reaction.model';
import { User } from '../../users/models/user.model';
import { ReplyInThreadDto, GetThreadRepliesDto } from '../dto/thread.dto';
import { MentionService } from './mention.service';
import { ConversationSummaryService } from './conversation-summary.service';
import {
  ChatEventNames,
  ThreadRepliedEvent,
  MessageCreatedEvent,
} from '../events/chat.events';

@Injectable()
export class ThreadService {
  private readonly logger = new Logger(ThreadService.name);

  constructor(
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(MessageAttachment)
    private readonly attachmentRepository: typeof MessageAttachment,
    @InjectModel(MessageMention)
    private readonly mentionRepository: typeof MessageMention,
    private readonly mentionService: MentionService,
    private readonly summaryService: ConversationSummaryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Reply inside a thread (Parent Message)
   */
  async replyInThread(
    conversationId: number,
    parentMessageId: number,
    dto: ReplyInThreadDto,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const parent = await this.messageRepository.findOne({
      where: { id: parentMessageId, conversationId, isDeleted: false },
    });

    if (!parent) {
      throw new NotFoundException('Parent message not found or belongs to another conversation');
    }

    const conversation = await this.conversationRepository.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.isLocked) {
      throw new ForbiddenException('Conversation is locked');
    }

    // Mention parsing
    const parsedMentions = this.mentionService.parseMentions(dto.content);
    await this.mentionService.validateMentionPermissions(conversationId, actor.id, parsedMentions);
    const mentionedUserIds = await this.mentionService.resolveMentionedUsers(
      conversationId,
      actor.id,
      dto.mentionUserIds || [],
      parsedMentions,
    );

    let createdReply: Message;
    let threadSummary: any;

    await this.sequelize.transaction(async (t) => {
      createdReply = await this.messageRepository.create(
        {
          conversationId,
          senderId: actor.id,
          content: dto.content,
          type: dto.type,
          payload: dto.payload || null,
          parentId: parentMessageId,
          isEdited: false,
          version: 1,
          isDeleted: false,
        } as any,
        { transaction: t },
      );

      // Attachments
      if (dto.attachmentIds && dto.attachmentIds.length > 0) {
        const attachRows = dto.attachmentIds.map((attId) => ({
          messageId: createdReply.id,
          attachmentId: attId,
        }));
        await this.attachmentRepository.bulkCreate(attachRows as any, { transaction: t });
      }

      // Mentions
      if (mentionedUserIds.length > 0) {
        const mentionRows = mentionedUserIds.map((uId) => ({
          messageId: createdReply.id,
          userId: uId,
        }));
        await this.mentionRepository.bulkCreate(mentionRows as any, { transaction: t });
      }

      // Update summary
      await this.summaryService.updateActivity(conversationId, t);
    });

    // Post-commit summary calculation & event emission
    const fullReply = await this.messageRepository.findByPk(createdReply.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: MessageAttachment, as: 'attachments' },
        { model: MessageReaction, as: 'reactions' },
      ],
    });

    threadSummary = await this.getThreadSummary(conversationId, parentMessageId, actor.id);

    // Emit Domain Events
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_CREATED,
      new MessageCreatedEvent(
        conversationId,
        conversation.companyId,
        fullReply,
        dto.clientMessageId,
      ),
    );

    this.eventEmitter.emit(
      ChatEventNames.THREAD_REPLIED,
      new ThreadRepliedEvent(
        conversationId,
        parentMessageId,
        conversation.companyId,
        fullReply,
        threadSummary,
      ),
    );

    // Dispatch mention notifications
    if (mentionedUserIds.length > 0) {
      this.mentionService.dispatchMentionNotifications(
        conversationId,
        conversation.name || 'Thread Discussion',
        actor.name || 'A teammate',
        mentionedUserIds,
        dto.content.substring(0, 100),
      );
    }

    return {
      message: fullReply,
      threadSummary,
    };
  }

  /**
   * Get paginated replies inside a thread
   */
  async getThreadReplies(
    conversationId: number,
    parentMessageId: number,
    query: GetThreadRepliesDto,
  ) {
    const limit = Math.min(query.limit || 50, 100);
    const where: any = {
      conversationId,
      parentId: parentMessageId,
      isDeleted: false,
    };

    if (query.cursor) {
      where.id = { [Op.gt]: query.cursor };
    }

    const replies = await this.messageRepository.findAll({
      where,
      limit,
      order: [['id', 'ASC']],
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: MessageAttachment, as: 'attachments' },
        { model: MessageReaction, as: 'reactions' },
        { model: MessageMention, as: 'mentions' },
      ],
    });

    return {
      parentMessageId,
      replies,
      nextCursor: replies.length === limit ? replies[replies.length - 1].id : null,
    };
  }

  /**
   * Get summary metadata of a thread (participants, total replies, last reply)
   */
  async getThreadSummary(
    conversationId: number,
    parentMessageId: number,
    requestingUserId?: number,
  ) {
    const replies = await this.messageRepository.findAll({
      where: { conversationId, parentId: parentMessageId, isDeleted: false },
      attributes: ['id', 'senderId', 'createdAt'],
      order: [['id', 'DESC']],
      limit: 50,
      include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'email'] }],
    });

    const replyCount = await this.messageRepository.count({
      where: { conversationId, parentId: parentMessageId, isDeleted: false },
    });

    const participantMap = new Map<number, any>();
    for (const r of replies) {
      if (r.sender && !participantMap.has(r.sender.id)) {
        participantMap.set(r.sender.id, {
          id: r.sender.id,
          name: r.sender.name,
          email: r.sender.email,
        });
      }
    }

    const lastReply = replies.length > 0 ? replies[0] : null;

    return {
      parentMessageId,
      replyCount,
      lastReplyAt: lastReply ? lastReply.createdAt : null,
      lastReplyId: lastReply ? lastReply.id : null,
      participants: Array.from(participantMap.values()),
    };
  }
}
