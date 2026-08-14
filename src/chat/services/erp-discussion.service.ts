import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { ConversationSetting } from '../models/conversation-setting.model';
import { Message } from '../models/message.model';
import { User } from '../../users/models/user.model';
import { ConversationType, MemberRole, MessageType } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import {
  ChatEventNames,
  ConversationCreatedEvent,
} from '../events/chat.events';

export interface ErpDiscussionParams {
  entityType: string;
  entityId: string;
  entityName?: string;
  entityVersion?: number;
  participantUserIds?: number[];
  initialContextNote?: string;
}

@Injectable()
export class ErpDiscussionService {
  private readonly logger = new Logger(ErpDiscussionService.name);

  constructor(
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(ConversationSetting)
    private readonly settingRepository: typeof ConversationSetting,
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Get or automatically initialize an isolated ERP contextual discussion
   */
  async getOrCreateDiscussion(
    params: ErpDiscussionParams,
    actor: { id: number; name?: string; companyId: number; clientId?: number },
  ) {
    const { entityType, entityId, entityName, participantUserIds, initialContextNote } = params;

    let conversation = await this.conversationRepository.findOne({
      where: {
        entityType,
        entityId,
        companyId: actor.companyId,
      },
      include: [
        {
          model: ConversationMember,
          as: 'members',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        },
        { model: ConversationSetting, as: 'settings' },
      ],
    });

    if (!conversation) {
      const channelName = entityName
        ? `[${entityType.toUpperCase()}] ${entityName}`
        : `[${entityType.toUpperCase()} #${entityId}] Discussion`;

      let createdConv: Conversation;

      await this.sequelize.transaction(async (t) => {
        createdConv = await this.conversationRepository.create(
          {
            clientId: actor.clientId || null,
            companyId: actor.companyId,
            name: channelName,
            type: ConversationType.GROUP,
            entityType,
            entityId,
            isArchived: false,
            isLocked: false,
            announcementMode: false,
            createdBy: actor.id,
          } as any,
          { transaction: t },
        );

        // Provision default settings
        await this.settingRepository.create(
          {
            conversationId: createdConv.id,
            allowVoice: true,
            allowVideo: true,
            allowGif: true,
            allowForward: true,
            allowReply: true,
            allowEdit: true,
            allowDelete: true,
            allowReaction: true,
            allowPoll: true,
            allowMention: true,
            allowExport: true,
            maxUploadSize: 104857600,
          } as any,
          { transaction: t },
        );

        // Add creator as OWNER
        await this.memberRepository.create(
          {
            conversationId: createdConv.id,
            userId: actor.id,
            role: MemberRole.OWNER,
            joinedAt: new Date(),
          } as any,
          { transaction: t },
        );

        // Add ERP participants if provided
        if (participantUserIds && participantUserIds.length > 0) {
          const distinctIds = Array.from(
            new Set(participantUserIds.filter((id) => id !== actor.id)),
          );
          const memberRows = distinctIds.map((uId) => ({
            conversationId: createdConv.id,
            userId: uId,
            role: MemberRole.MEMBER,
            joinedAt: new Date(),
          }));
          await this.memberRepository.bulkCreate(memberRows as any, { transaction: t });
        }

        // Post initial system message if provided
        if (initialContextNote) {
          await this.messageRepository.create(
            {
              conversationId: createdConv.id,
              senderId: null,
              content: `📌 ERP Discussion linked to ${entityType.toUpperCase()} #${entityId}. Context: ${initialContextNote}`,
              type: MessageType.SYSTEM,
              payload: { entityType, entityId, isSystem: true },
              isEdited: false,
              version: 1,
              isDeleted: false,
            } as any,
            { transaction: t },
          );
        }

        // Audit log
        await this.auditService.writeLog({
          clientId: actor.clientId || null,
          companyId: actor.companyId,
          userId: actor.id,
          action: 'CREATE_ERP_DISCUSSION',
          entityType: 'CONVERSATION',
          entityId: createdConv.id,
          newValue: { entityType, entityId, channelName },
        });
      });

      conversation = await this.conversationRepository.findByPk(createdConv.id, {
        include: [
          {
            model: ConversationMember,
            as: 'members',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
          },
          { model: ConversationSetting, as: 'settings' },
        ],
      });

      // Emit Domain Event
      this.eventEmitter.emit(
        ChatEventNames.CONVERSATION_CREATED,
        new ConversationCreatedEvent(actor.companyId, conversation),
      );
    } else {
      // Ensure actor is a member of this conversation
      const isMember = conversation.members.some((m) => m.userId === actor.id);
      if (!isMember) {
        await this.memberRepository.create({
          conversationId: conversation.id,
          userId: actor.id,
          role: MemberRole.MEMBER,
          joinedAt: new Date(),
        } as any);

        // Refresh conversation members
        conversation = await this.conversationRepository.findByPk(conversation.id, {
          include: [
            {
              model: ConversationMember,
              as: 'members',
              include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
            },
            { model: ConversationSetting, as: 'settings' },
          ],
        });
      }
    }

    return conversation;
  }
}
