import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConversationMember } from '../models/conversation-member.model';
import { User } from '../../users/models/user.model';
import { MemberRole } from '../constants/chat.constants';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';

export interface MentionParseResult {
  userIds: number[];
  hasAll: boolean;
  hasHere: boolean;
  roleNames: string[];
  departmentNames: string[];
}

@Injectable()
export class MentionService {
  private readonly logger = new Logger(MentionService.name);

  constructor(
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(User)
    private readonly userRepository: typeof User,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Parse mention tokens from string content:
   * Formats supported:
   * @[user:123] or @user_123 or @all or @here or @role:admin or @dept:sales
   */
  parseMentions(content: string | null): MentionParseResult {
    if (!content) {
      return { userIds: [], hasAll: false, hasHere: false, roleNames: [], departmentNames: [] };
    }

    const userIds: number[] = [];
    const roleNames: string[] = [];
    const departmentNames: string[] = [];
    let hasAll = false;
    let hasHere = false;

    // Check for @all or @channel
    if (/\B@(all|channel)\b/i.test(content)) {
      hasAll = true;
    }

    // Check for @here
    if (/\B@here\b/i.test(content)) {
      hasHere = true;
    }

    // Check for user IDs: @user:123 or @[user:123] or @123
    const userMatches = content.matchAll(/\B@(user:)?(\d+)\b/gi);
    for (const match of userMatches) {
      const id = parseInt(match[2], 10);
      if (!isNaN(id) && !userIds.includes(id)) {
        userIds.push(id);
      }
    }

    // Check for role mentions: @role:Manager
    const roleMatches = content.matchAll(/\B@role:([a-zA-Z0-9_-]+)\b/gi);
    for (const match of roleMatches) {
      if (!roleNames.includes(match[1])) {
        roleNames.push(match[1]);
      }
    }

    // Check for dept mentions: @dept:Sales
    const deptMatches = content.matchAll(/\B@dept:([a-zA-Z0-9_-]+)\b/gi);
    for (const match of deptMatches) {
      if (!departmentNames.includes(match[1])) {
        departmentNames.push(match[1]);
      }
    }

    return { userIds, hasAll, hasHere, roleNames, departmentNames };
  }

  /**
   * Validate sender permission to broadcast @all or @here in conversation
   */
  async validateMentionPermissions(
    conversationId: number,
    senderId: number,
    parsed: MentionParseResult,
  ): Promise<void> {
    if (parsed.hasAll || parsed.hasHere) {
      const member = await this.memberRepository.findOne({
        where: { conversationId, userId: senderId },
      });

      const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MODERATOR];
      if (!member || !allowedRoles.includes(member.role)) {
        throw new ForbiddenException('Only channel admins or moderators can mention @all or @here');
      }
    }
  }

  /**
   * Resolve all mentioned recipient user IDs in a conversation
   */
  async resolveMentionedUsers(
    conversationId: number,
    senderId: number,
    explicitUserIds: number[],
    parsed: MentionParseResult,
  ): Promise<number[]> {
    const allRecipientIds = new Set<number>(explicitUserIds || []);

    for (const id of parsed.userIds) {
      if (id !== senderId) {
        allRecipientIds.add(id);
      }
    }

    if (parsed.hasAll || parsed.hasHere) {
      const members = await this.memberRepository.findAll({
        where: { conversationId },
        attributes: ['userId'],
      });
      for (const m of members) {
        if (m.userId !== senderId) {
          allRecipientIds.add(m.userId);
        }
      }
    }

    return Array.from(allRecipientIds);
  }

  /**
   * Send notification to mentioned users
   */
  async dispatchMentionNotifications(
    conversationId: number,
    conversationName: string,
    senderName: string,
    recipientUserIds: number[],
    messageSnippet: string,
  ): Promise<void> {
    if (!recipientUserIds || recipientUserIds.length === 0) return;

    try {
      await this.notificationsService.createNotification({
        recipients: recipientUserIds,
        type: NotificationType.CHAT,
        referenceType: 'CONVERSATION',
        referenceId: conversationId,
        title: `Mentioned by ${senderName}`,
        payload: {
          conversationId,
          conversationName,
          senderName,
          snippet: messageSnippet,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to send mention notification: ${err.message}`);
    }
  }
}
