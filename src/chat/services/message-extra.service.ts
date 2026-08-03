import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { MessagePin } from '../models/message-pin.model';
import { Message } from '../models/message.model';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { ConversationDraft } from '../models/conversation-draft.model';
import { MessageReadState } from '../models/message-read-state.model';
import { MessageAttachment } from '../models/message-attachment.model';
import { MessageReaction } from '../models/message-reaction.model';
import { User } from '../../users/models/user.model';
import { SaveDraftDto } from '../dto/message-extra.dto';
import { MemberRole } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { ChatEventNames, MessagePinnedEvent } from '../events/chat.events';

@Injectable()
export class MessageExtraService {
  private readonly logger = new Logger(MessageExtraService.name);

  constructor(
    @InjectModel(MessagePin)
    private readonly pinRepository: typeof MessagePin,
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(ConversationDraft)
    private readonly draftRepository: typeof ConversationDraft,
    @InjectModel(MessageReadState)
    private readonly readStateRepository: typeof MessageReadState,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Pin a message in conversation
   */
  async pinMessage(
    conversationId: number,
    messageId: number,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, conversationId, isDeleted: false },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Role check: Owner, Admin, Moderator
    const member = await this.memberRepository.findOne({
      where: { conversationId, userId: actor.id },
    });
    const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MODERATOR];
    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Only channel admins or moderators can pin messages');
    }

    await this.sequelize.transaction(async (t) => {
      await this.pinRepository.findOrCreate({
        where: { conversationId, messageId },
        defaults: {
          conversationId,
          messageId,
          pinnedBy: actor.id,
          pinnedAt: new Date(),
        } as any,
        transaction: t,
      });

      await this.auditService.writeLog({
        userId: actor.id,
        companyId: actor.companyId,
        clientId: actor.clientId,
        action: 'PIN_MESSAGE',
        entityType: 'MESSAGE',
        entityId: messageId,
        newValue: { conversationId },
      });
    });

    // Emit Domain Event
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_PINNED,
      new MessagePinnedEvent(conversationId, actor.companyId, messageId, actor.id, true),
    );

    return { message: 'Message pinned successfully', messageId };
  }

  /**
   * Unpin a message from conversation
   */
  async unpinMessage(
    conversationId: number,
    messageId: number,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const member = await this.memberRepository.findOne({
      where: { conversationId, userId: actor.id },
    });
    const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MODERATOR];
    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Only channel admins or moderators can unpin messages');
    }

    await this.sequelize.transaction(async (t) => {
      await this.pinRepository.destroy({
        where: { conversationId, messageId },
        transaction: t,
      });

      await this.auditService.writeLog({
        userId: actor.id,
        companyId: actor.companyId,
        clientId: actor.clientId,
        action: 'UNPIN_MESSAGE',
        entityType: 'MESSAGE',
        entityId: messageId,
        oldValue: { conversationId },
      });
    });

    // Emit Domain Event
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_PINNED,
      new MessagePinnedEvent(conversationId, actor.companyId, messageId, actor.id, false),
    );

    return { message: 'Message unpinned successfully', messageId };
  }

  /**
   * Get all pinned messages in conversation
   */
  async getPinnedMessages(conversationId: number) {
    const pins = await this.pinRepository.findAll({
      where: { conversationId },
      order: [['pinnedAt', 'DESC']],
      include: [
        {
          model: Message,
          as: 'message',
          include: [
            { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
            { model: MessageAttachment, as: 'attachments' },
            { model: MessageReaction, as: 'reactions' },
          ],
        },
        { model: User, as: 'pinner', attributes: ['id', 'name', 'email'] },
      ],
    });

    return pins;
  }

  /**
   * Star / Bookmark a message
   */
  async starMessage(messageId: number, userId: number) {
    const message = await this.messageRepository.findByPk(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const [readState] = await this.readStateRepository.findOrCreate({
      where: { messageId, userId },
      defaults: { messageId, userId, isRead: true, isStarred: true } as any,
    });

    readState.isStarred = true;
    await readState.save();

    return { message: 'Message starred successfully', messageId, isStarred: true };
  }

  /**
   * Unstar a message
   */
  async unstarMessage(messageId: number, userId: number) {
    const readState = await this.readStateRepository.findOne({
      where: { messageId, userId },
    });

    if (readState) {
      readState.isStarred = false;
      await readState.save();
    }

    return { message: 'Message unstarred successfully', messageId, isStarred: false };
  }

  /**
   * Get all starred messages for user
   */
  async getStarredMessages(userId: number, companyId: number) {
    const starredStates = await this.readStateRepository.findAll({
      where: { userId, isStarred: true },
      include: [
        {
          model: Message,
          as: 'message',
          include: [
            { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
            { model: MessageAttachment, as: 'attachments' },
            { model: Conversation, as: 'conversation', attributes: ['id', 'name', 'type', 'companyId'] },
          ],
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    // Filter by company isolation
    return starredStates
      .filter((s) => s.message && s.message.conversation && s.message.conversation.companyId === companyId)
      .map((s) => s.message);
  }

  /**
   * Save or update draft for user in conversation
   */
  async saveDraft(conversationId: number, userId: number, dto: SaveDraftDto) {
    const [draft] = await this.draftRepository.findOrCreate({
      where: { conversationId, userId },
      defaults: { conversationId, userId, content: dto.content, payload: dto.payload } as any,
    });

    draft.content = dto.content || null;
    draft.payload = dto.payload || null;
    await draft.save();

    return draft;
  }

  /**
   * Get draft for user in conversation
   */
  async getDraft(conversationId: number, userId: number) {
    return this.draftRepository.findOne({
      where: { conversationId, userId },
    });
  }

  /**
   * Delete draft
   */
  async deleteDraft(conversationId: number, userId: number) {
    await this.draftRepository.destroy({
      where: { conversationId, userId },
    });
    return { message: 'Draft cleared' };
  }
}
