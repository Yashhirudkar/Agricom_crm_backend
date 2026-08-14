import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { ConversationSetting } from '../models/conversation-setting.model';
import { Message } from '../models/message.model';
import { User } from '../../users/models/user.model';
import { ConversationType, MemberRole, MessageType } from '../constants/chat.constants';

export const DEFAULT_ENTERPRISE_CHANNELS = [
  {
    name: 'general',
    description: 'Company-wide general discussions, updates and casual banter',
    announcementMode: false,
  },
  {
    name: 'announcements',
    description: 'Official company-wide announcements, policies, and executive memos (Broadcast Only)',
    announcementMode: true,
  },
  {
    name: 'sales',
    description: 'Sales team deals, leads pipeline, client closures and revenue updates',
    announcementMode: false,
  },
  {
    name: 'purchase',
    description: 'Procurement, vendor negotiations, quotations and purchase orders',
    announcementMode: false,
  },
  {
    name: 'warehouse',
    description: 'Inventory management, stock dispatch, delivery status and warehouse logistics',
    announcementMode: false,
  },
  {
    name: 'hr-helpdesk',
    description: 'Human resources updates, attendance, leaves, payroll and employee support',
    announcementMode: false,
  },
  {
    name: 'finance-accounts',
    description: 'Accounting, tax invoices, vendor payments and financial compliance',
    announcementMode: false,
  },
  {
    name: 'customer-support',
    description: 'Customer tickets, service escalations and client satisfaction',
    announcementMode: false,
  },
];

@Injectable()
export class ChatBootstrapService {
  private readonly logger = new Logger(ChatBootstrapService.name);

  constructor(
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(ConversationSetting)
    private readonly settingRepository: typeof ConversationSetting,
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(User)
    private readonly userRepository: typeof User,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Idempotently provision default enterprise channels for a company and auto-join active users
   */
  async bootstrapCompanyChannels(
    companyId: number,
    adminUserId: number,
  ): Promise<{ provisioned: number; channels: Conversation[] }> {
    const existingChannels = await this.conversationRepository.findAll({
      where: { companyId, type: ConversationType.CHANNEL },
    });

    const existingNames = new Set(existingChannels.map((c) => c.name.toLowerCase()));
    const createdChannels: Conversation[] = [];

    // Find company users to auto-add to general & announcements
    const companyUsers = await this.userRepository.findAll({
      where: { companyId, isActive: true },
      attributes: ['id'],
    });
    const userIds = companyUsers.map((u) => u.id);

    for (const ch of DEFAULT_ENTERPRISE_CHANNELS) {
      if (!existingNames.has(ch.name.toLowerCase())) {
        await this.sequelize.transaction(async (t) => {
          const conv = await this.conversationRepository.create(
            {
              companyId,
              name: ch.name,
              description: ch.description,
              type: ConversationType.CHANNEL,
              announcementMode: ch.announcementMode,
              isArchived: false,
              isLocked: false,
              createdBy: adminUserId,
            } as any,
            { transaction: t },
          );

          await this.settingRepository.create(
            {
              conversationId: conv.id,
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

          // Add admin as OWNER
          await this.memberRepository.create(
            {
              conversationId: conv.id,
              userId: adminUserId,
              role: MemberRole.OWNER,
              joinedAt: new Date(),
            } as any,
            { transaction: t },
          );

          // Auto-add all active users as regular members
          const otherUserIds = userIds.filter((id) => id !== adminUserId);
          if (otherUserIds.length > 0) {
            const memberRows = otherUserIds.map((uId) => ({
              conversationId: conv.id,
              userId: uId,
              role: MemberRole.MEMBER,
              joinedAt: new Date(),
            }));
            await this.memberRepository.bulkCreate(memberRows as any, { transaction: t });
          }

          // Welcome message
          await this.messageRepository.create(
            {
              conversationId: conv.id,
              senderId: adminUserId,
              content: `🎉 Welcome to #${ch.name}! ${ch.description}.`,
              type: MessageType.TEXT,
              isEdited: false,
              version: 1,
              isDeleted: false,
            } as any,
            { transaction: t },
          );

          createdChannels.push(conv);
        });
      }
    }

    return {
      provisioned: createdChannels.length,
      channels: createdChannels,
    };
  }
}
