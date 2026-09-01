import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import { join } from 'path';
import { ATTACHMENT_UPLOAD_DIR } from '../../attachments/config/multer.config';
import { Conversation } from '../models/conversation.model';
import { ConversationSetting } from '../models/conversation-setting.model';
import { ConversationMember } from '../models/conversation-member.model';
import { Message } from '../models/message.model';
import { MessageReaction } from '../models/message-reaction.model';
import { MessageAttachment } from '../models/message-attachment.model';
import { MessageMention } from '../models/message-mention.model';
import { MessageReadState } from '../models/message-read-state.model';
import { MessageVersion } from '../models/message-version.model';
import { MessagePin } from '../models/message-pin.model';
import { User } from '../../users/models/user.model';
import { Attachment } from '../../attachments/models/attachment.model';
import { SendMessageDto, ReactMessageDto } from '../dto/chat.dto';
import { MessageType, MemberRole } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { PolicyService } from './policy.service';
import { UnreadService } from './unread.service';
import {
  ChatEventNames,
  MessageCreatedEvent,
  MessageUpdatedEvent,
  MessageDeletedEvent,
  MessageReactedEvent,
  MessageReadEvent,
  ConversationUpdatedEvent,
} from '../events/chat.events';
import { Op } from 'sequelize';

@Injectable()
export class MessageService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  // In-memory idempotency cache for duplicate prevention during retries (60s TTL)
  private readonly idempotencyCache = new Map<
    string,
    { message: Message; timestamp: number }
  >();

  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    @InjectModel(MessageReaction)
    private readonly reactionModel: typeof MessageReaction,
    @InjectModel(MessageAttachment)
    private readonly messageAttachmentModel: typeof MessageAttachment,
    @InjectModel(MessageMention)
    private readonly mentionModel: typeof MessageMention,
    @InjectModel(MessageReadState)
    private readonly readStateModel: typeof MessageReadState,
    @InjectModel(MessageVersion)
    private readonly versionModel: typeof MessageVersion,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Attachment)
    private readonly attachmentModel: typeof Attachment,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly summaryService: ConversationSummaryService,
    private readonly policyService: PolicyService,
    private readonly unreadService: UnreadService,
  ) {
    // Periodic cleanup of idempotency cache every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanupIdempotencyCache(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanupIdempotencyCache() {
    const now = Date.now();
    for (const [key, val] of this.idempotencyCache.entries()) {
      if (now - val.timestamp > 60 * 1000) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  private verifyPermissions(settings: ConversationSetting, type: MessageType) {
    if (type === MessageType.VOICE && !settings.allowVoice) {
      throw new ForbiddenException('Voice notes are disabled in this conversation.');
    }
    if (type === MessageType.VIDEO && !settings.allowVideo) {
      throw new ForbiddenException('Video messages are disabled in this conversation.');
    }
    if (type === MessageType.POLL && !settings.allowPoll) {
      throw new ForbiddenException('Polls are disabled in this conversation.');
    }
  }

  async send(
    conversationId: number,
    companyId: number,
    dto: SendMessageDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
    clientMessageId?: string,
  ): Promise<Message> {
    const senderId = actor.userId;

    // Idempotency check: if clientMessageId was processed within last 60s, return cached message
    if (clientMessageId) {
      const cacheKey = `${senderId}:${conversationId}:${clientMessageId}`;
      const cached = this.idempotencyCache.get(cacheKey);
      if (cached) {
        return cached.message;
      }
    }

    // 1. Get conversation with settings
    const conversation = await this.conversationModel.findOne({
      where: { id: conversationId, companyId },
      include: [ConversationSetting],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    // Verify using Policy Engine
    await this.policyService.canSend(conversationId, actor, companyId);

    // Get sender membership for mute status checks
    const member = await this.memberModel.findOne({
      where: { conversationId, userId: senderId },
    });

    if (member && member.isMuted) {
      if (member.mutedUntil && new Date() > member.mutedUntil) {
        member.isMuted = false;
        member.mutedUntil = null;
        await member.save();
      } else {
        throw new ForbiddenException('You are muted in this conversation.');
      }
    }

    // 4. Verify message type permissions
    if (conversation.settings) {
      this.verifyPermissions(conversation.settings, dto.type);
    }

    let createdMessageId: number;
    const mentionedUserIds = new Set<number>();
    let unhidMembers = false;

    const t = await this.messageModel.sequelize.transaction();
    try {
      // 5. Create Message
      const message = await this.messageModel.create(
        {
          conversationId,
          senderId,
          content: dto.content || null,
          type: dto.type,
          payload: dto.payload || null,
          isEdited: false,
          version: 1,
          parentId: dto.parentId || null,
          isDeleted: false,
        } as any,
        { transaction: t },
      );

      createdMessageId = message.id;

      // 6. Handle Attachments
      if (dto.attachmentId) {
        const attachment = await this.attachmentModel.findByPk(dto.attachmentId, { transaction: t });
        if (!attachment) {
          throw new NotFoundException('Attachment not found.');
        }

        if (conversation.settings && conversation.settings.maxUploadSize) {
          if (attachment.fileSize > conversation.settings.maxUploadSize) {
            throw new BadRequestException('Attached file size exceeds channel limit.');
          }
        }

        await this.messageAttachmentModel.create(
          {
            messageId: message.id,
            attachmentId: dto.attachmentId,
          } as any,
          { transaction: t },
        );

        message.payload = {
          ...message.payload,
          attachmentId: attachment.id,
          filePath: `/attachments/download/${attachment.storagePath || attachment.storedName}`,
          fileName: attachment.originalName,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize,
        };
        await message.save({ transaction: t });
      }

      // 7. Handle Mentions
      if (dto.content) {
        const mentionRegex = /@\[(\d+)\]/g;
        let match;
        while ((match = mentionRegex.exec(dto.content)) !== null) {
          mentionedUserIds.add(parseInt(match[1], 10));
        }
      }

      for (const mentionedId of mentionedUserIds) {
        const isUserInRoom = await this.memberModel.findOne({
          where: { conversationId, userId: mentionedId },
          transaction: t,
        });

        if (isUserInRoom) {
          await this.mentionModel.create(
            {
              messageId: message.id,
              userId: mentionedId,
            } as any,
            { transaction: t },
          );
        }
      }

      // 8. Auto-mark read for sender
      member.lastReadMessageId = message.id;
      await member.save({ transaction: t });

      await this.readStateModel.create(
        {
          userId: senderId,
          messageId: message.id,
          isRead: true,
          readAt: new Date(),
        } as any,
        { transaction: t },
      );

      // Increment unread counters for all non-sender members
      await this.unreadService.incrementCounters(
        conversationId,
        senderId,
        Array.from(mentionedUserIds),
        !!dto.parentId,
        t,
      );

      // 9. Unhide members who had hidden this conversation
      const [affectedCount] = await this.memberModel.update(
        { isHidden: false },
        {
          where: { conversationId, isHidden: true },
          transaction: t,
        },
      );
      if (affectedCount > 0) {
        unhidMembers = true;
      }

      // Force updatedAt update on conversation to bubble to top
      await this.conversationModel.update(
        { updatedAt: new Date() },
        { where: { id: conversationId }, transaction: t }
      );

      // COMMIT TRANSACTION
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    // ------------------------------------------------------------------------
    // AFTER COMMIT: Load rich metadata, emit domain event & notifications
    // ------------------------------------------------------------------------
    const fullMessage = await this.messageModel.findByPk(createdMessageId, {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
        {
          model: MessageAttachment,
          include: [Attachment],
        },
        {
          model: Message,
          as: 'parentMessage',
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['id', 'name', 'email', 'avatarUrl'],
            },
          ],
        },
      ],
    });

    const resultMessage = fullMessage || (await this.messageModel.findByPk(createdMessageId));

    // Cache for idempotency
    if (clientMessageId) {
      const cacheKey = `${senderId}:${conversationId}:${clientMessageId}`;
      this.idempotencyCache.set(cacheKey, {
        message: resultMessage,
        timestamp: Date.now(),
      });
    }

    // Record conversation summary activity
    await this.summaryService.recordNewMessage(conversationId, resultMessage);

    if (unhidMembers) {
      this.eventEmitter.emit(
        ChatEventNames.CONVERSATION_UPDATED,
        new ConversationUpdatedEvent(conversationId, companyId, { id: conversationId }),
      );
    }

    // EMIT DOMAIN EVENT STRICTLY AFTER COMMIT
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_CREATED,
      new MessageCreatedEvent(conversationId, companyId, resultMessage, clientMessageId),
    );

    // Asynchronously dispatch notifications to members
    this.dispatchMessageNotifications(conversation, resultMessage, senderId, mentionedUserIds, dto.content);

    return resultMessage;
  }

  private async dispatchMessageNotifications(
    conversation: Conversation,
    message: Message,
    senderId: number,
    mentionedUserIds: Set<number>,
    content?: string,
  ) {
    try {
      const activeMembers = await this.memberModel.findAll({
        where: { conversationId: conversation.id, userId: { [Op.ne]: senderId } },
      });
      const recipients = activeMembers.map((m) => m.userId);

      if (recipients.length > 0) {
        const mentionRecipients = Array.from(mentionedUserIds).filter((id) => recipients.includes(id));
        const regularRecipients = activeMembers
          .filter((m) => !m.isNotificationMuted && !mentionedUserIds.has(m.userId))
          .map((m) => m.userId);

        const senderName = message.sender?.name || 'Someone';
        const snippetText = content || (message.type === 'FILE' ? '📎 Sent a file' : message.type === 'VOICE' ? '🎤 Sent a voice note' : 'Sent a message');

        const notificationTitle = conversation.type === 'DIRECT'
          ? `${senderName}`
          : `New message in: ${conversation.name || 'Group'}`;

        const mentionTitle = conversation.type === 'DIRECT'
          ? `You were tagged by ${senderName}`
          : `You were tagged in: ${conversation.name || 'Group'}`;

        const notificationBody = conversation.type === 'DIRECT'
          ? snippetText
          : `${senderName}: ${snippetText}`;

        if (mentionRecipients.length > 0) {
          await this.notificationsService.createNotification(
            {
              recipients: mentionRecipients,
              type: NotificationType.CHAT,
              referenceType: 'message',
              referenceId: message.id,
              title: mentionTitle,
              category: 'SYSTEM',
              payload: {
                conversationId: conversation.id,
                senderId,
                snippet: content,
                message: notificationBody
              },
            },
            senderId,
          );
        }

        if (regularRecipients.length > 0) {
          await this.notificationsService.createNotification(
            {
              recipients: regularRecipients,
              type: NotificationType.CHAT,
              referenceType: 'message',
              referenceId: message.id,
              title: notificationTitle,
              category: 'SYSTEM',
              payload: {
                conversationId: conversation.id,
                senderId,
                snippet: content,
                message: notificationBody
              },
            },
            senderId,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Failed to dispatch message notification: ${err.message}`);
    }
  }

  async edit(
    conversationId: number,
    messageId: number,
    content: string,
    companyId: number,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<Message> {
    const message = await this.messageModel.findOne({
      where: { id: messageId, conversationId },
      include: [{ model: Conversation, where: { companyId } }],
    });

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    await this.policyService.canEditMessage(conversationId, actor, companyId, message.senderId);

    if (message.isDeleted) {
      throw new BadRequestException('Cannot edit a deleted message.');
    }

    const t = await this.messageModel.sequelize.transaction();
    try {
      // Snapshot previous version for audit and compliance
      await this.versionModel.create(
        {
          messageId: message.id,
          version: message.version,
          content: message.content,
          payload: message.payload,
          editedBy: actor.userId,
        } as any,
        { transaction: t },
      );

      message.content = content;
      message.isEdited = true;
      message.version += 1;
      await message.save({ transaction: t });

      await this.auditService.writeLog({
        clientId: actor.clientId || null,
        companyId,
        userId: actor.userId,
        action: 'EDIT_MESSAGE',
        entityType: 'MESSAGE',
        entityId: message.id,
        newValue: { conversationId, newVersion: message.version },
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    // EMIT DOMAIN EVENT STRICTLY AFTER COMMIT / PERSISTENCE
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_UPDATED,
      new MessageUpdatedEvent(conversationId, companyId, messageId, message),
    );

    return message;
  }

  async getMessageVersions(messageId: number, companyId: number): Promise<MessageVersion[]> {
    const message = await this.messageModel.findOne({
      where: { id: messageId },
      include: [{ model: Conversation, where: { companyId } }],
    });

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    return this.versionModel.findAll({
      where: { messageId },
      order: [['version', 'ASC']],
      include: [{ model: User, as: 'editor', attributes: ['id', 'name', 'email'] }],
    });
  }

  private async deletePhysicalAttachment(message: Message) {
    try {
      // 1. Delete associated MessageAttachment & Attachment models and physical files
      const msgAttachments = await this.messageAttachmentModel.findAll({
        where: { messageId: message.id },
        include: [Attachment],
      });

      for (const msgAtt of msgAttachments) {
        if (msgAtt.attachment) {
          const filename = msgAtt.attachment.storagePath || msgAtt.attachment.storedName;
          if (filename) {
            const diskPath = join(process.cwd(), ATTACHMENT_UPLOAD_DIR, filename);
            if (fs.existsSync(diskPath)) {
              fs.unlinkSync(diskPath);
              this.logger.log(`Physically deleted attachment file from storage: ${diskPath}`);
            }
          }
          await msgAtt.attachment.destroy({ force: true });
        }
        await msgAtt.destroy({ force: true });
      }

      // 2. Check payload.filePath if present (direct chat uploads)
      if (message.payload?.filePath) {
        const filePathStr = message.payload.filePath as string;
        const filename = filePathStr.split('/').pop();
        if (filename) {
          // Check ./storage/attachments
          const storagePath = join(process.cwd(), ATTACHMENT_UPLOAD_DIR, filename);
          if (fs.existsSync(storagePath)) {
            fs.unlinkSync(storagePath);
            this.logger.log(`Physically deleted payload file from storage/attachments: ${storagePath}`);
          }
          // Check ./uploads/chat
          const uploadsChatPath = join(process.cwd(), 'uploads', 'chat', filename);
          if (fs.existsSync(uploadsChatPath)) {
            fs.unlinkSync(uploadsChatPath);
            this.logger.log(`Physically deleted payload file from uploads/chat: ${uploadsChatPath}`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error deleting physical attachment files for message ${message.id}: ${err.message}`);
    }
  }

  async delete(
    conversationId: number,
    messageId: number,
    mode: 'everyone' | 'me',
    companyId: number,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const message = await this.messageModel.findOne({
      where: { id: messageId, conversationId },
      include: [{ model: Conversation, where: { companyId } }],
    });

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    await this.policyService.canView(conversationId, actor, companyId);

    if (mode === 'everyone') {
      await this.policyService.canDeleteMessage(conversationId, actor, companyId, message.senderId);

      // Hard delete physical files from disk & attachment DB entries
      await this.deletePhysicalAttachment(message);

      message.isDeleted = true;
      message.content = null;
      message.payload = null;
      message.deletedBy = actor.userId;
      message.deletedAt = new Date();
      await message.save();

      // Write Audit Log
      await this.auditService.writeLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Message',
        entityId: message.id,
        action: 'DELETE_FOR_EVERYONE',
        newValue: { deletedBy: actor.userId },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      // EMIT DOMAIN EVENT
      this.eventEmitter.emit(
        ChatEventNames.MESSAGE_DELETED,
        new MessageDeletedEvent(conversationId, companyId, messageId, actor.userId, 'everyone'),
      );
    } else {
      // Delete for Me
      await this.readStateModel.upsert({
        userId: actor.userId,
        messageId,
        isRead: true,
        readAt: new Date(),
        deletedAt: new Date(),
      } as any);

      this.eventEmitter.emit(
        ChatEventNames.MESSAGE_DELETED,
        new MessageDeletedEvent(conversationId, companyId, messageId, actor.userId, 'me'),
      );
    }
  }

  async clearChat(
    conversationId: number,
    companyId: number,
    userId: number,
  ): Promise<void> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this conversation.');
    }

    const conversation = await this.conversationModel.findOne({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    // Find all active (non-deleted) messages in this conversation
    const messages = await this.messageModel.findAll({
      where: { conversationId, isDeleted: false },
      attributes: ['id'],
    });

    const messageIds = messages.map((m) => m.id);

    if (messageIds.length > 0) {
      // Find existing states
      const existingStates = await this.readStateModel.findAll({
        where: {
          userId,
          messageId: { [Op.in]: messageIds },
        },
        attributes: ['messageId'],
      });

      const existingMessageIds = new Set(existingStates.map((s) => s.messageId));

      // Update existing states
      if (existingStates.length > 0) {
        await this.readStateModel.update(
          { deletedAt: new Date(), isRead: true, readAt: new Date() },
          {
            where: {
              userId,
              messageId: { [Op.in]: Array.from(existingMessageIds) },
            },
          },
        );
      }

      // Bulk create new read state records for messages that don't have one
      const newStatesToCreate = messageIds
        .filter((id) => !existingMessageIds.has(id))
        .map((id) => ({
          userId,
          messageId: id,
          isRead: true,
          readAt: new Date(),
          deletedAt: new Date(),
        }));

      if (newStatesToCreate.length > 0) {
        await this.readStateModel.bulkCreate(newStatesToCreate);
      }
    }
  }

  async react(
    conversationId: number,
    messageId: number,
    dto: ReactMessageDto,
    companyId: number,
    actor: { userId: number; clientId: number | null },
  ): Promise<MessageReaction> {
    const message = await this.messageModel.findOne({
      where: { id: messageId, conversationId },
      include: [{ model: Conversation, where: { companyId } }],
    });

    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    const userId = actor.userId;

    const existing = await this.reactionModel.findOne({
      where: { messageId, userId, reaction: dto.reaction },
    });

    let reactionRecord: MessageReaction;
    if (existing) {
      await existing.destroy();
      reactionRecord = existing;
    } else {
      reactionRecord = await this.reactionModel.create({
        messageId,
        userId,
        reaction: dto.reaction,
      } as any);
    }

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_REACTED,
      new MessageReactedEvent(conversationId, companyId, messageId, userId, dto.reaction, reactionRecord),
    );

    return reactionRecord;
  }

  async markRead(conversationId: number, lastMessageId: number, userId: number): Promise<void> {
    let member = await this.memberModel.findOne({
      where: { conversationId, userId },
      include: [Conversation],
    });

    if (!member) {
      const conversation = await this.conversationModel.findByPk(conversationId);
      if (!conversation) {
        return;
      }

      // Auto-join/create membership for user viewing the conversation (e.g. Super Admin, public channel viewer)
      member = await this.memberModel.create({
        conversationId,
        userId,
        role: MemberRole.MEMBER,
        joinedAt: new Date(),
        lastReadMessageId: lastMessageId || null,
        unreadMessagesCount: 0,
        unreadMentionsCount: 0,
        unreadThreadsCount: 0,
      } as any);

      (member as any).conversation = conversation;
    } else {
      member.lastReadMessageId = lastMessageId || member.lastReadMessageId;
      member.unreadMessagesCount = 0;
      member.unreadMentionsCount = 0;
      member.unreadThreadsCount = 0;
      await member.save();
    }

    if (lastMessageId) {
      await this.readStateModel.upsert({
        userId,
        messageId: lastMessageId,
        isRead: true,
        readAt: new Date(),
      } as any);
    }

    const companyId = (member as any).conversation?.companyId || 0;

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_READ,
      new MessageReadEvent(conversationId, companyId, userId, lastMessageId),
    );
  }

  async getHistory(
    conversationId: number,
    companyId: number,
    user: any,
    cursor?: number,
    limit: number = 30,
  ) {
    await this.policyService.canView(conversationId, user, companyId);

    const userId = user.userId || user.id;

    const where: any = {
      conversationId,
    };

    const mutedStates = await this.readStateModel.findAll({
      where: {
        userId,
        deletedAt: { [Op.ne]: null },
      },
      attributes: ['messageId'],
    });

    const mutedMessageIds = mutedStates.map((s) => s.messageId);
    if (mutedMessageIds.length > 0) {
      where.id = { [Op.notIn]: mutedMessageIds };
    }

    if (cursor) {
      where.id = {
        ...where.id,
        [Op.lt]: cursor,
      };
    }

    const messages = await this.messageModel.findAll({
      where,
      limit: limit + 1,
      order: [['id', 'DESC']],
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
        {
          model: MessageReaction,
          attributes: ['userId', 'reaction'],
        },
        {
          model: MessagePin,
          as: 'pins',
          attributes: ['pinnedAt', 'pinnedBy'],
        },
        {
          model: Message,
          as: 'parentMessage',
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['id', 'name', 'email', 'avatarUrl'],
            },
          ],
        },
      ],
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // Map items to plain objects and inject pinnedAt attribute
    const mappedItems = items.map((msg) => {
      const plain = msg.get({ plain: true }) as any;
      plain.pinnedAt = plain.pins && plain.pins.length > 0 ? plain.pins[0].pinnedAt : null;
      return plain;
    });

    const nextCursor = items.length > 0 ? items[items.length - 1].id : null;

    return {
      data: mappedItems.reverse(),
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Offline Sync catch-up: fetches messages newer than lastReceivedMessageId
   */
  async getMissedMessages(
    conversationId: number,
    lastReceivedMessageId: number,
    userId: number,
    limit: number = 50,
  ): Promise<Message[]> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this conversation.');
    }

    return this.messageModel.findAll({
      where: {
        conversationId,
        id: { [Op.gt]: lastReceivedMessageId },
        isDeleted: false,
      },
      order: [['id', 'ASC']],
      limit,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
        },
      ],
    });
  }
}
