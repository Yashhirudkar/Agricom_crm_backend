import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation } from '../models/conversation.model';
import { ConversationSetting } from '../models/conversation-setting.model';
import { ConversationMember } from '../models/conversation-member.model';
import { Message } from '../models/message.model';
import { User } from '../../users/models/user.model';
import { CreateConversationDto, UpdateConversationDto, UpdatePostingPolicyDto } from '../dto/chat.dto';
import { ConversationType, MemberRole, PostingPolicy } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  ChatEventNames,
  ConversationCreatedEvent,
  ConversationUpdatedEvent,
  ConversationArchivedEvent,
  ConversationLockedEvent,
} from '../events/chat.events';
import { Op } from 'sequelize';
import { Employee } from '../../hrms/models/employee.model';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../../hrms/models/designation.model';

@Injectable()
export class ConversationService implements OnModuleInit {
  async onModuleInit() {
    this.repairInvalidDMs().catch((err) => {
      console.error('[ConversationService] Failed to run DM repair routine:', err);
    });
  }

  private async repairInvalidDMs() {
    console.log('[ConversationService] Starting DM verification and repair routine...');
    const directConvs = await this.conversationModel.findAll({
      where: { type: ConversationType.DIRECT },
      include: [ConversationMember],
    });

    let deletedCount = 0;
    for (const conv of directConvs) {
      const members = conv.members || [];
      if (members.length < 2) {
        await conv.destroy({ force: true });
        deletedCount++;
        console.log(`[ConversationService] Deleted invalid DM conversation #${conv.id} with ${members.length} members.`);
      }
    }

    if (deletedCount > 0) {
      console.log(`[ConversationService] DM verification complete. Deleted ${deletedCount} broken DM conversations.`);
    } else {
      console.log('[ConversationService] DM verification complete. All DM conversations are valid.');
    }
  }
  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationSetting)
    private readonly settingModel: typeof ConversationSetting,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    @InjectModel(User)
    private readonly userModel: typeof User,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async create(
    companyId: number,
    dto: CreateConversationDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<Conversation> {
    const creatorId = actor.userId;
    const clientId = actor.clientId;

    let recipientId: number | null = null;

    // 1. Validate & De-duplicate DIRECT messaging conversations
    if (dto.type === ConversationType.DIRECT) {
      if (!dto.memberUserIds || dto.memberUserIds.length !== 1) {
        throw new BadRequestException('Direct message must specify exactly one recipient user ID.');
      }
      recipientId = dto.memberUserIds[0];

      if (Number(recipientId) === Number(creatorId)) {
        throw new BadRequestException('You cannot start a direct message with yourself.');
      }

      // Validate recipient belongs to the same company and is active
      const recipientCheck = await this.conversationModel.sequelize.query(
        `SELECT u.id 
         FROM "users" u
         JOIN "employees" e ON e."userId" = u.id
         WHERE u.id = :recipientId AND e."companyId" = :companyId AND u."isActive" = true LIMIT 1;`,
        {
          replacements: { recipientId, companyId },
          type: 'SELECT',
        }
      ) as any[];

      if (recipientCheck.length === 0) {
        throw new BadRequestException('Recipient user not found, inactive, or belongs to another company workspace.');
      }

      const dms = await this.conversationModel.findAll({
        where: {
          type: ConversationType.DIRECT,
          companyId,
        },
        include: [
          {
            model: ConversationMember,
            required: true,
          },
        ],
      });

      const existingDM = dms.find((conv) => {
        const memberIds = conv.members?.map((m) => Number(m.userId)) || [];
        return (
          memberIds.length === 2 &&
          memberIds.includes(Number(creatorId)) &&
          memberIds.includes(Number(recipientId))
        );
      });

      if (existingDM) {
        const fullDM = await this.conversationModel.findByPk(existingDM.id, {
          include: [
            {
              model: ConversationSetting,
            },
            {
              model: ConversationMember,
              attributes: ['userId', 'role', 'isMuted', 'mutedUntil', 'lastReadMessageId', 'isPinned', 'isFavorite', 'unreadMessagesCount', 'isNotificationMuted'],
              include: [
                {
                  model: User,
                  attributes: ['id', 'name', 'email', 'avatarUrl', 'status', 'lastLogin'],
                  include: [
                    {
                      model: Employee,
                      attributes: ['id', 'firstName', 'lastName', 'email', 'mobile', 'status', 'workMode'],
                      include: [
                        { model: Department, attributes: ['id', 'name'] },
                        { model: Designation, attributes: ['id', 'name'] },
                      ]
                    }
                  ]
                }
              ]
            }
          ],
        });
        if (fullDM) return fullDM;
      }
    }

    let createdId: number;
    const t = await this.conversationModel.sequelize.transaction();
    try {
      // 2. Create conversation
      const conversation = await this.conversationModel.create(
        {
          clientId,
          companyId,
          name: dto.name || null,
          description: dto.description || null,
          type: dto.type,
          entityType: dto.entityType || null,
          entityId: dto.entityId || null,
          createdBy: creatorId,
          isArchived: false,
          isLocked: false,
          announcementMode: dto.type === ConversationType.ANNOUNCEMENT,
        } as any,
        { transaction: t },
      );

      createdId = conversation.id;

      // 3. Initialize default settings
      await this.settingModel.create(
        {
          conversationId: conversation.id,
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
          maxUploadSize: 10485760, // 10MB
          retentionDays: null,
        } as any,
        { transaction: t },
      );

      // 4. Create owner membership
      await this.memberModel.create(
        {
          conversationId: conversation.id,
          userId: creatorId,
          role: MemberRole.OWNER,
          isMuted: false,
          isNotificationMuted: false,
          joinedAt: new Date(),
        } as any,
        { transaction: t },
      );

      // 5. Add other members
      if (dto.type === ConversationType.DIRECT) {
        if (!recipientId) {
          throw new BadRequestException('Direct message recipient ID is missing.');
        }
        await this.memberModel.create(
          {
            conversationId: conversation.id,
            userId: recipientId,
            role: MemberRole.MEMBER,
            isMuted: false,
            isNotificationMuted: false,
            joinedAt: new Date(),
          } as any,
          { transaction: t },
        );
      } else {
        if (dto.memberUserIds && dto.memberUserIds.length > 0) {
          const uniqueMemberIds = Array.from(new Set(dto.memberUserIds)).filter((id) => id !== creatorId);
          for (const memberId of uniqueMemberIds) {
            const userExists = await this.userModel.findOne({
              where: { id: memberId, isActive: true },
              transaction: t,
            });

            if (userExists) {
              await this.memberModel.create(
                {
                  conversationId: conversation.id,
                  userId: memberId,
                  role: MemberRole.MEMBER,
                  isMuted: false,
                  isNotificationMuted: false,
                  joinedAt: new Date(),
                } as any,
                { transaction: t },
              );
            }
          }
        }
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    // ------------------------------------------------------------------------
    // AFTER COMMIT: Load rich metadata, Audit Log & Emit Domain Event
    // ------------------------------------------------------------------------
    const fullConversation = await this.conversationModel.findByPk(createdId, {
      include: [
        {
          model: ConversationSetting,
        },
        {
          model: ConversationMember,
          attributes: ['userId', 'role', 'isMuted', 'mutedUntil', 'lastReadMessageId', 'isPinned', 'isFavorite', 'unreadMessagesCount', 'isNotificationMuted'],
          include: [
            {
              model: User,
              attributes: ['id', 'name', 'email', 'avatarUrl', 'status', 'lastLogin'],
              include: [
                {
                  model: Employee,
                  attributes: ['id', 'firstName', 'lastName', 'email', 'mobile', 'status', 'workMode'],
                  include: [
                    { model: Department, attributes: ['id', 'name'] },
                    { model: Designation, attributes: ['id', 'name'] },
                  ]
                }
              ]
            }
          ]
        }
      ],
    });

    if (fullConversation) {
      if (fullConversation.type === ConversationType.DIRECT && (!fullConversation.members || fullConversation.members.length !== 2)) {
        throw new InternalServerErrorException('Invalid DM conversation (Direct Message must contain exactly two members).');
      }
    }

    await this.auditService.writeLog({
      clientId,
      companyId,
      userId: creatorId,
      entityType: 'Conversation',
      entityId: createdId,
      action: 'CREATE',
      newValue: fullConversation ? fullConversation.toJSON() : null,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.CONVERSATION_CREATED,
      new ConversationCreatedEvent(companyId, fullConversation),
    );

    return fullConversation;
  }

  async getConversations(
    companyId: number,
    userId: number,
    filters: { type?: ConversationType; entityType?: string; entityId?: string; page?: number; limit?: number; archived?: boolean },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const where: any = {
      companyId,
      isArchived: filters.archived === true,
    };

    if (this.conversationModel.sequelize) {
      where.id = {
        [Op.in]: this.conversationModel.sequelize.literal(`(
          SELECT "conversationId" 
          FROM "conversation_members" 
          WHERE "userId" = ${userId} AND "isHidden" = false
        )`)
      };
    }

    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }

    const { rows, count } = await this.conversationModel.findAndCountAll({
      where,
      limit,
      offset,
      include: [
        {
          model: ConversationMember,
          attributes: ['userId', 'role', 'isMuted', 'mutedUntil', 'lastReadMessageId', 'isPinned', 'isFavorite', 'unreadMessagesCount', 'isNotificationMuted'],
          include: [
            {
              model: User,
              attributes: ['id', 'name', 'email', 'avatarUrl', 'status', 'lastLogin'],
              include: [
                {
                  model: Employee,
                  attributes: ['id', 'firstName', 'lastName', 'email', 'mobile', 'status', 'workMode'],
                  include: [
                    { model: Department, attributes: ['id', 'name'] },
                    { model: Designation, attributes: ['id', 'name'] },
                  ]
                }
              ]
            }
          ]
        },
        {
          model: ConversationSetting,
        },
      ],
      order: [['updatedAt', 'DESC']],
      distinct: true,
    });

    const data = await Promise.all(
      rows.map(async (conv) => {
        const plain = conv.toJSON() as any;
        const membership = conv.members.find((m: any) => m.userId === userId);

        const lastMessageWhere: any = {
          conversationId: conv.id,
          isDeleted: false,
        };

        if (this.conversationModel.sequelize) {
          lastMessageWhere.id = {
            [Op.notIn]: this.conversationModel.sequelize.literal(`(
              SELECT "messageId" 
              FROM "message_read_states" 
              WHERE "userId" = ${userId} AND "deletedAt" IS NOT NULL
            )`)
          };
        }

        const lastMessage = await this.messageModel.findOne({
          where: lastMessageWhere,
          order: [['createdAt', 'DESC']],
          attributes: ['id', 'content', 'type', 'createdAt'],
        });

        let unreadCount = 0;
        const unreadWhere: any = {
          conversationId: conv.id,
          isDeleted: false,
          senderId: { [Op.ne]: userId },
        };
        const idConditions: any[] = [];
        if (this.conversationModel.sequelize) {
          idConditions.push({
            [Op.notIn]: this.messageModel.sequelize.literal(`(
              SELECT "messageId" 
              FROM "message_read_states" 
              WHERE "userId" = ${userId} AND "deletedAt" IS NOT NULL
            )`)
          });
        }
        if (membership && membership.lastReadMessageId) {
          idConditions.push({
            [Op.gt]: membership.lastReadMessageId,
          });
        }
        if (idConditions.length > 0) {
          unreadWhere.id = idConditions.length === 1 ? idConditions[0] : { [Op.and]: idConditions };
        }
        unreadCount = await this.messageModel.count({ where: unreadWhere });

        plain.unreadCount = unreadCount;
        plain.lastMessage = lastMessage ? lastMessage.toJSON() : null;
        return plain;
      }),
    );

    return {
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async getConversationById(conversationId: number, companyId: number): Promise<Conversation> {
    const conversation = await this.conversationModel.findOne({
      where: { id: conversationId, companyId },
      include: [
        {
          model: ConversationSetting,
        },
        {
          model: ConversationMember,
          attributes: ['userId', 'role', 'isMuted', 'mutedUntil', 'lastReadMessageId', 'isPinned', 'isFavorite', 'unreadMessagesCount', 'isNotificationMuted'],
          include: [
            {
              model: User,
              attributes: ['id', 'name', 'email', 'avatarUrl', 'status', 'lastLogin'],
              include: [
                {
                  model: Employee,
                  attributes: ['id', 'firstName', 'lastName', 'email', 'mobile', 'status', 'workMode'],
                  include: [
                    { model: Department, attributes: ['id', 'name'] },
                    { model: Designation, attributes: ['id', 'name'] },
                  ]
                }
              ]
            }
          ]
        },
      ],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    return conversation;
  }

  async update(
    conversationId: number,
    companyId: number,
    dto: UpdateConversationDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(conversationId, companyId);
    const oldRecord = conversation.toJSON();

    if (dto.name !== undefined) conversation.name = dto.name;
    if (dto.description !== undefined) conversation.description = dto.description;
    if (dto.avatarUrl !== undefined) conversation.avatarUrl = dto.avatarUrl;
    if (dto.isArchived !== undefined) {
      conversation.isArchived = dto.isArchived;
      conversation.deletedAt = dto.isArchived ? new Date() : null;
    }
    if (dto.isLocked !== undefined) conversation.isLocked = dto.isLocked;
    if (dto.announcementMode !== undefined) conversation.announcementMode = dto.announcementMode;

    await conversation.save();

    const updatedRecord = await this.getConversationById(conversationId, companyId);

    // Audit Log
    await this.auditService.writeDiffLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'Conversation',
      entityId: conversationId,
      action: 'UPDATE',
      oldRecord,
      newRecord: updatedRecord,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // EMIT DOMAIN EVENT
    if (dto.isArchived !== undefined) {
      this.eventEmitter.emit(
        ChatEventNames.CONVERSATION_ARCHIVED,
        new ConversationArchivedEvent(conversationId, companyId, actor.userId),
      );
    } else if (dto.isLocked !== undefined) {
      this.eventEmitter.emit(
        ChatEventNames.CONVERSATION_LOCKED,
        new ConversationLockedEvent(conversationId, companyId, dto.isLocked, actor.userId),
      );
    } else {
      this.eventEmitter.emit(
        ChatEventNames.CONVERSATION_UPDATED,
        new ConversationUpdatedEvent(conversationId, companyId, updatedRecord),
      );
    }

    return updatedRecord;
  }

  async archive(
    conversationId: number,
    companyId: number,
    archive: boolean,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    await this.update(conversationId, companyId, { isArchived: archive }, actor);
  }

  async delete(
    conversationId: number,
    companyId: number,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId, companyId);
    
    // Perform hard-delete (force: true) to permanently delete from the database.
    // This triggers CASCADE deletion on database level for all members, messages, settings, etc.
    await conversation.destroy({ force: true });

    // Audit Log
    await this.auditService.writeLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'Conversation',
      entityId: conversationId,
      action: 'DELETE',
    });
  }

  async setLock(
    conversationId: number,
    companyId: number,
    lock: boolean,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    await this.update(conversationId, companyId, { isLocked: lock }, actor);
  }

  /**
   * Update the posting policy of a channel conversation.
   * Endpoint: PATCH /conversations/:id/posting-policy
   * Permission: chat_channel:update_posting_policy (or chat:update as fallback)
   */
  async updatePostingPolicy(
    conversationId: number,
    companyId: number,
    dto: UpdatePostingPolicyDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(conversationId, companyId);

    // Only CHANNEL and ANNOUNCEMENT type conversations support posting policy
    const allowedTypes = [ConversationType.CHANNEL, ConversationType.ANNOUNCEMENT];
    if (!allowedTypes.includes(conversation.type)) {
      throw new BadRequestException(
        'Posting policy can only be set on CHANNEL or ANNOUNCEMENT conversations.',
      );
    }

    const oldRecord = conversation.toJSON();

    // Update posting policy
    (conversation as any).postingPolicy = dto.postingPolicy;

    // Clear old allowedPosters / allowedRoles before setting new ones
    (conversation as any).allowedPosters = [];
    (conversation as any).allowedRoles = [];

    if (dto.postingPolicy === PostingPolicy.SELECTED_USERS && dto.allowedPosters?.length) {
      (conversation as any).allowedPosters = dto.allowedPosters;
    }

    if (dto.postingPolicy === PostingPolicy.SELECTED_ROLES && dto.allowedRoles?.length) {
      (conversation as any).allowedRoles = dto.allowedRoles;
    }

    await conversation.save();

    const updatedRecord = await this.getConversationById(conversationId, companyId);

    // Audit log
    await this.auditService.writeDiffLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'Conversation',
      entityId: conversationId,
      action: 'UPDATE',
      oldRecord,
      newRecord: updatedRecord,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Emit conversation_updated so frontend cache invalidates
    this.eventEmitter.emit(
      ChatEventNames.CONVERSATION_UPDATED,
      new ConversationUpdatedEvent(conversationId, companyId, updatedRecord),
    );

    return updatedRecord;
  }
}
