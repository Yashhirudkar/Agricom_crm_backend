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
import { RetentionPolicy } from '../models/retention-policy.model';
import { ConversationPermissionOverride } from '../models/conversation-permission-override.model';
import {
  ConversationType,
  MemberRole,
  PostingPolicy,
  VisibilityType,
  EnterpriseSecurityLevel,
  ConversationClassification,
  NotificationPrivacy,
  TypingVisibility,
  PresenceVisibility,
  ExportPolicy,
  ActionPolicy,
} from '../constants/chat.constants';
import { CreateConversationDto, UpdateConversationDto, UpdatePostingPolicyDto } from '../dto/chat.dto';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { PolicyService } from './policy.service';
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
    private readonly policyService: PolicyService,
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
      // Resolve Presets & defaults
      let vis = dto.visibility !== undefined ? dto.visibility : VisibilityType.MEMBERS_ONLY;
      let sidebar = dto.showInSidebar !== undefined ? dto.showInSidebar : true;
      let search = dto.showInSearch !== undefined ? dto.showInSearch : true;
      let gSearch = dto.showInGlobalSearch !== undefined ? dto.showInGlobalSearch : true;
      let hMetadata = dto.epHideMetadata !== undefined ? dto.epHideMetadata : false;
      let hApi = dto.epHideApi !== undefined ? dto.epHideApi : false;
      let hSocket = dto.epHideSocket !== undefined ? dto.epHideSocket : false;
      let hSearch = dto.epHideSearch !== undefined ? dto.epHideSearch : false;
      let nOverride = dto.epNobodyOverride !== undefined ? dto.epNobodyOverride : false;
      let notifPrivacy = dto.notificationPrivacy !== undefined ? dto.notificationPrivacy : NotificationPrivacy.MEMBERS_ONLY;
      let typingVis = dto.typingVisibility !== undefined ? dto.typingVisibility : TypingVisibility.MEMBERS_ONLY;
      let presenceVis = dto.presenceVisibility !== undefined ? dto.presenceVisibility : PresenceVisibility.EVERYONE;

      const preset = dto.enterpriseSecurityLevel;
      if (preset === EnterpriseSecurityLevel.CONFIDENTIAL) {
        vis = VisibilityType.MEMBERS_ONLY;
        search = false;
        gSearch = false;
        hMetadata = true;
        hSocket = true;
        hSearch = true;
        nOverride = false;
        notifPrivacy = NotificationPrivacy.MEMBERS_ONLY;
        typingVis = TypingVisibility.MEMBERS_ONLY;
      } else if (preset === EnterpriseSecurityLevel.SECRET) {
        vis = VisibilityType.HIDDEN;
        sidebar = false;
        search = false;
        gSearch = false;
        hMetadata = true;
        hApi = true;
        hSocket = true;
        hSearch = true;
        nOverride = true;
        notifPrivacy = NotificationPrivacy.NOBODY;
        typingVis = TypingVisibility.NOBODY;
        presenceVis = PresenceVisibility.NOBODY;
      }

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
          visibility: vis,
          classification: dto.classification || ConversationClassification.INTERNAL,
          enterpriseSecurityLevel: preset || EnterpriseSecurityLevel.STANDARD,
          retentionPolicyId: dto.retentionPolicyId || null,
          invitePolicy: dto.invitePolicy || ActionPolicy.MEMBER,
          removeMemberPolicy: dto.removeMemberPolicy || ActionPolicy.ADMIN,
          renamePolicy: dto.renamePolicy || ActionPolicy.ADMIN,
          iconPolicy: dto.iconPolicy || ActionPolicy.ADMIN,
          descPolicy: dto.descPolicy || ActionPolicy.ADMIN,
          archivePolicy: dto.archivePolicy || ActionPolicy.ADMIN,
          deletePolicy: dto.deletePolicy || ActionPolicy.OWNER,
          showInSidebar: sidebar,
          showInSearch: search,
          showInMention: dto.showInMention !== undefined ? dto.showInMention : true,
          showInRecentChats: dto.showInRecentChats !== undefined ? dto.showInRecentChats : true,
          showInGlobalSearch: gSearch,
          notificationPrivacy: notifPrivacy,
          typingVisibility: typingVis,
          presenceVisibility: presenceVis,
          exportPolicy: dto.exportPolicy || ExportPolicy.ADMIN,
          legalHoldActive: dto.legalHoldActive || false,
          isFrozen: dto.isFrozen || false,
          dynamicMembershipRules: dto.dynamicMembershipRules || null,
          epHideMetadata: hMetadata,
          epHideApi: hApi,
          epHideSocket: hSocket,
          epHideSearch: hSearch,
          epNobodyOverride: nOverride,
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
          allowForward: dto.allowForward !== undefined ? dto.allowForward : true,
          allowReply: dto.allowReply !== undefined ? dto.allowReply : true,
          allowEdit: dto.allowEdit !== undefined ? dto.allowEdit : true,
          allowDelete: dto.allowDelete !== undefined ? dto.allowDelete : true,
          allowReaction: dto.allowReaction !== undefined ? dto.allowReaction : true,
          allowPoll: dto.allowPoll !== undefined ? dto.allowPoll : true,
          allowMention: dto.allowMention !== undefined ? dto.allowMention : true,
          allowExport: dto.allowExport !== undefined ? dto.allowExport : true,
          maxUploadSize: 10485760, // 10MB
          retentionDays: null,
          allowSend: dto.allowSend !== undefined ? dto.allowSend : true,
          allowPin: dto.allowPin !== undefined ? dto.allowPin : true,
          pinPolicy: dto.pinPolicy || ActionPolicy.MEMBER,
          allowDownload: dto.allowDownload !== undefined ? dto.allowDownload : true,
          disableCopy: dto.disableCopy !== undefined ? dto.disableCopy : false,
          screenshotProtectionBestEffort: dto.screenshotProtectionBestEffort !== undefined ? dto.screenshotProtectionBestEffort : false,
          disablePrint: dto.disablePrint !== undefined ? dto.disablePrint : false,
        } as any,
        { transaction: t },
      );

      // Create owner membership
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

      // Add overrides if passed
      if (dto.permissionOverrides && dto.permissionOverrides.length > 0) {
        await this.syncPermissionOverrides(conversation.id, dto.permissionOverrides, t);
      }

      // Add other members
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
    // AFTER COMMIT: Sync dynamic memberships, Load rich metadata, Audit Log & Emit Domain Event
    // ------------------------------------------------------------------------
    if (dto.dynamicMembershipRules) {
      await this.syncDynamicMemberships(createdId);
    }

    const fullConversation = await this.conversationModel.findByPk(createdId, {
      include: [
        {
          model: ConversationSetting,
        },
        {
          model: ConversationPermissionOverride,
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
    userType: string,
    filters: { type?: ConversationType; entityType?: string; entityId?: string; page?: number; limit?: number; archived?: boolean },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const accessibleIds = await this.policyService.getAccessibleConversationIds(userId, companyId, userType);

    const where: any = {
      companyId,
      isArchived: filters.archived === true,
    };

    if (this.conversationModel.sequelize) {
      const hiddenLiteral = this.conversationModel.sequelize.literal(`(
        SELECT "conversationId" 
        FROM "conversation_members" 
        WHERE "userId" = ${userId} AND "isHidden" = true
      )`);

      where.id = {
        [Op.in]: accessibleIds,
        [Op.notIn]: hiddenLiteral,
      };
    } else {
      where.id = {
        [Op.in]: accessibleIds,
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
          model: ConversationPermissionOverride,
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

    if (conversation.isFrozen && dto.isFrozen === undefined && dto.legalHoldActive === undefined) {
      throw new ForbiddenException('This conversation is frozen and read-only.');
    }

    if (dto.name !== undefined) conversation.name = dto.name;
    if (dto.description !== undefined) conversation.description = dto.description;
    if (dto.avatarUrl !== undefined) conversation.avatarUrl = dto.avatarUrl;
    if (dto.isArchived !== undefined) {
      conversation.isArchived = dto.isArchived;
      conversation.deletedAt = dto.isArchived ? new Date() : null;
    }
    if (dto.isLocked !== undefined) conversation.isLocked = dto.isLocked;
    if (dto.announcementMode !== undefined) conversation.announcementMode = dto.announcementMode;

    // Advanced Visibility & Security Policy Updates
    if (dto.visibility !== undefined) conversation.visibility = dto.visibility;
    if (dto.classification !== undefined) conversation.classification = dto.classification;
    if (dto.enterpriseSecurityLevel !== undefined) {
      conversation.enterpriseSecurityLevel = dto.enterpriseSecurityLevel;
      const preset = dto.enterpriseSecurityLevel;
      if (preset === EnterpriseSecurityLevel.CONFIDENTIAL) {
        conversation.visibility = VisibilityType.MEMBERS_ONLY;
        conversation.showInSearch = false;
        conversation.showInGlobalSearch = false;
        conversation.epHideMetadata = true;
        conversation.epHideSocket = true;
        conversation.epHideSearch = true;
        conversation.epNobodyOverride = false;
        conversation.notificationPrivacy = NotificationPrivacy.MEMBERS_ONLY;
        conversation.typingVisibility = TypingVisibility.MEMBERS_ONLY;
      } else if (preset === EnterpriseSecurityLevel.SECRET) {
        conversation.visibility = VisibilityType.HIDDEN;
        conversation.showInSidebar = false;
        conversation.showInSearch = false;
        conversation.showInGlobalSearch = false;
        conversation.epHideMetadata = true;
        conversation.epHideApi = true;
        conversation.epHideSocket = true;
        conversation.epHideSearch = true;
        conversation.epNobodyOverride = true;
        conversation.notificationPrivacy = NotificationPrivacy.NOBODY;
        conversation.typingVisibility = TypingVisibility.NOBODY;
        conversation.presenceVisibility = PresenceVisibility.NOBODY;
      }
    }

    if (dto.retentionPolicyId !== undefined) conversation.retentionPolicyId = dto.retentionPolicyId;
    if (dto.invitePolicy !== undefined) conversation.invitePolicy = dto.invitePolicy;
    if (dto.removeMemberPolicy !== undefined) conversation.removeMemberPolicy = dto.removeMemberPolicy;
    if (dto.renamePolicy !== undefined) conversation.renamePolicy = dto.renamePolicy;
    if (dto.iconPolicy !== undefined) conversation.iconPolicy = dto.iconPolicy;
    if (dto.descPolicy !== undefined) conversation.descPolicy = dto.descPolicy;
    if (dto.archivePolicy !== undefined) conversation.archivePolicy = dto.archivePolicy;
    if (dto.deletePolicy !== undefined) conversation.deletePolicy = dto.deletePolicy;
    if (dto.showInSidebar !== undefined) conversation.showInSidebar = dto.showInSidebar;
    if (dto.showInSearch !== undefined) conversation.showInSearch = dto.showInSearch;
    if (dto.showInMention !== undefined) conversation.showInMention = dto.showInMention;
    if (dto.showInRecentChats !== undefined) conversation.showInRecentChats = dto.showInRecentChats;
    if (dto.showInGlobalSearch !== undefined) conversation.showInGlobalSearch = dto.showInGlobalSearch;
    if (dto.notificationPrivacy !== undefined) conversation.notificationPrivacy = dto.notificationPrivacy;
    if (dto.typingVisibility !== undefined) conversation.typingVisibility = dto.typingVisibility;
    if (dto.presenceVisibility !== undefined) conversation.presenceVisibility = dto.presenceVisibility;
    if (dto.exportPolicy !== undefined) conversation.exportPolicy = dto.exportPolicy;
    if (dto.legalHoldActive !== undefined) conversation.legalHoldActive = dto.legalHoldActive;
    if (dto.isFrozen !== undefined) conversation.isFrozen = dto.isFrozen;
    if (dto.dynamicMembershipRules !== undefined) conversation.dynamicMembershipRules = dto.dynamicMembershipRules;
    if (dto.epHideMetadata !== undefined) conversation.epHideMetadata = dto.epHideMetadata;
    if (dto.epHideApi !== undefined) conversation.epHideApi = dto.epHideApi;
    if (dto.epHideSocket !== undefined) conversation.epHideSocket = dto.epHideSocket;
    if (dto.epHideSearch !== undefined) conversation.epHideSearch = dto.epHideSearch;
    if (dto.epNobodyOverride !== undefined) conversation.epNobodyOverride = dto.epNobodyOverride;

    await conversation.save();

    // 2. Settings table updates
    if (conversation.settings) {
      const s = conversation.settings;
      if (dto.allowForward !== undefined) s.allowForward = dto.allowForward;
      if (dto.allowReply !== undefined) s.allowReply = dto.allowReply;
      if (dto.allowEdit !== undefined) s.allowEdit = dto.allowEdit;
      if (dto.allowDelete !== undefined) s.allowDelete = dto.allowDelete;
      if (dto.allowReaction !== undefined) s.allowReaction = dto.allowReaction;
      if (dto.allowPoll !== undefined) s.allowPoll = dto.allowPoll;
      if (dto.allowMention !== undefined) s.allowMention = dto.allowMention;
      if (dto.allowExport !== undefined) s.allowExport = dto.allowExport;
      if (dto.allowSend !== undefined) s.allowSend = dto.allowSend;
      if (dto.allowPin !== undefined) s.allowPin = dto.allowPin;
      if (dto.pinPolicy !== undefined) s.pinPolicy = dto.pinPolicy;
      if (dto.allowDownload !== undefined) s.allowDownload = dto.allowDownload;
      if (dto.disableCopy !== undefined) s.disableCopy = dto.disableCopy;
      if (dto.screenshotProtectionBestEffort !== undefined) s.screenshotProtectionBestEffort = dto.screenshotProtectionBestEffort;
      if (dto.disablePrint !== undefined) s.disablePrint = dto.disablePrint;
      await s.save();
    }

    // 3. Sync permission overrides
    if (dto.permissionOverrides !== undefined) {
      await this.syncPermissionOverrides(conversationId, dto.permissionOverrides);
    }

    // 4. Sync dynamic memberships
    if (dto.dynamicMembershipRules !== undefined) {
      await this.syncDynamicMemberships(conversationId);
    }

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
    
    if (conversation.legalHoldActive) {
      throw new ForbiddenException('This conversation is under compliance legal hold. Deletion is disabled.');
    }

    // Perform soft-delete (force: false) to move to Recycle Bin.
    await conversation.destroy({ force: false });

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

  async syncPermissionOverrides(conversationId: number, overrides: any[], transaction?: any): Promise<void> {
    if (!overrides) return;
    // Delete existing overrides
    await this.conversationModel.sequelize.models.ConversationPermissionOverride.destroy({
      where: { conversationId },
      transaction,
    });

    // Create new overrides
    for (const ov of overrides) {
      await this.conversationModel.sequelize.models.ConversationPermissionOverride.create({
        conversationId,
        permission: ov.permission,
        principalType: ov.principalType,
        principalId: ov.principalId ? String(ov.principalId) : null,
        createdBy: ov.createdBy || null,
      }, { transaction });
    }
  }

  async syncDynamicMemberships(conversationId: number): Promise<void> {
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation || !conversation.dynamicMembershipRules) {
      return;
    }

    const rules = conversation.dynamicMembershipRules;
    const whereClause: any = { companyId: conversation.companyId };
    if (rules.departmentId) whereClause.departmentId = rules.departmentId;
    if (rules.designationId) whereClause.designationId = rules.designationId;
    if (rules.branchId) whereClause.branchId = rules.branchId;

    const matchingEmployees = await this.conversationModel.sequelize.models.Employee.findAll({
      where: whereClause,
      attributes: ['userId'],
    }) as any[];

    const targetUserIds = matchingEmployees.map(emp => emp.userId).filter(Boolean);

    // Get current memberships
    const currentMembers = await this.memberModel.findAll({
      where: { conversationId },
    });
    const currentMemberUserIds = currentMembers.map(m => m.userId);

    // Users to add
    const toAdd = targetUserIds.filter(id => !currentMemberUserIds.includes(id));
    // Users to remove
    const toRemove = currentMemberUserIds.filter(id => !targetUserIds.includes(id));

    // Add matching
    for (const userId of toAdd) {
      const userExists = await this.userModel.findOne({ where: { id: userId, isActive: true } });
      if (userExists) {
        await this.memberModel.create({
          conversationId,
          userId,
          role: MemberRole.MEMBER,
          joinedAt: new Date(),
        } as any);
      }
    }

    // Remove non-matching
    if (toRemove.length > 0) {
      await this.memberModel.destroy({
        where: { conversationId, userId: toRemove },
      });
    }
  }
}
