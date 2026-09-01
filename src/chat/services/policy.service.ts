import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OnEvent } from '@nestjs/event-emitter';
import { Op } from 'sequelize';
import { ChatEventNames } from '../events/chat.events';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { ConversationSetting } from '../models/conversation-setting.model';
import { ConversationPermissionOverride } from '../models/conversation-permission-override.model';
import { User } from '../../users/models/user.model';
import { UserCompany } from '../../users/models/user-company.model';
import { Role } from '../../rbac/models/role.model';
import { Employee } from '../../hrms/models/employee.model';
import {
  EnterpriseSecurityLevel,
  PrincipalType,
  ActionPolicy,
  ExportPolicy,
  VisibilityType,
} from '../constants/chat.constants';

@Injectable()
export class PolicyService {
  private readonly accessibleIdsCache = new Map<string, { ids: number[]; expiresAt: number }>();

  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(ConversationSetting)
    private readonly settingModel: typeof ConversationSetting,
    @InjectModel(ConversationPermissionOverride)
    private readonly overrideModel: typeof ConversationPermissionOverride,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
  ) {}

  /**
   * Resolves the active security flags based on the conversation's EnterpriseSecurityLevel
   */
  resolveSecurityFlags(conversation: Conversation) {
    const level = conversation.enterpriseSecurityLevel;
    if (level === EnterpriseSecurityLevel.STANDARD) {
      return {
        hideMetadata: false,
        hideApi: false,
        hideSocket: false,
        hideSearch: false,
        nobodyOverride: false,
      };
    }
    if (level === EnterpriseSecurityLevel.CONFIDENTIAL) {
      return {
        hideMetadata: true,
        hideApi: false,
        hideSocket: true,
        hideSearch: true,
        nobodyOverride: false,
      };
    }
    if (level === EnterpriseSecurityLevel.SECRET) {
      return {
        hideMetadata: true,
        hideApi: true,
        hideSocket: true,
        hideSearch: true,
        nobodyOverride: true,
      };
    }
    // CUSTOM level: return individual fields
    return {
      hideMetadata: conversation.epHideMetadata,
      hideApi: conversation.epHideApi,
      hideSocket: conversation.epHideSocket,
      hideSearch: conversation.epHideSearch,
      nobodyOverride: conversation.epNobodyOverride,
    };
  }

  /**
   * Main entrypoint for checking if a user has access to a conversation
   */
  async checkConversationAccess(
    conversationId: number,
    userId: number,
    companyId: number,
    userType: string,
  ): Promise<{ hasAccess: boolean; isMember: boolean; conversation: Conversation; member: ConversationMember | null }> {
    const where: any = { id: conversationId };
    if (companyId) {
      where[Op.or] = [{ companyId }, { companyId: null }];
    }
    let conversation = await this.conversationModel.findOne({
      where,
      include: [ConversationSetting],
    });

    if (!conversation) {
      conversation = await this.conversationModel.findByPk(conversationId, {
        include: [ConversationSetting],
      });
    }

    if (!conversation) {
      return { hasAccess: false, isMember: false, conversation: null, member: null };
    }

    // 1. Is user a member of the conversation?
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (member) {
      return { hasAccess: true, isMember: true, conversation, member };
    }

    if (userType === 'super_admin') {
      return { hasAccess: true, isMember: false, conversation, member: null };
    }

    // 2. Non-member access check
    const security = this.resolveSecurityFlags(conversation);

    // Evaluate explicit overrides (pass skipDefaultFallbacks = security.nobodyOverride)
    const hasOverride = await this.checkPermissionOverrides(
      conversationId,
      userId,
      companyId,
      userType,
      'VIEW',
      security.nobodyOverride
    );

    if (hasOverride) {
      return { hasAccess: true, isMember: false, conversation, member: null };
    }

    // If nobodyOverride is NOT enabled, check if the conversation is PUBLIC and not locked down by API/metadata limits
    if (!security.nobodyOverride && conversation.visibility === VisibilityType.PUBLIC && !security.hideApi) {
      return { hasAccess: true, isMember: false, conversation, member: null };
    }

    return { hasAccess: false, isMember: false, conversation, member: null };
  }

  private async checkPermissionOverrides(
    conversationId: number,
    userId: number,
    companyId: number,
    userType: string,
    permission: string,
    skipDefaultFallbacks = false,
  ): Promise<boolean> {
    const overrides = await this.overrideModel.findAll({
      where: { conversationId, permission },
    });

    // If no overrides are specifically defined, check default fallback behaviors
    if (overrides.length === 0) {
      if (skipDefaultFallbacks || permission === 'VIEW') {
        return false;
      }
      // Default: Super Admins bypass unless explicitly blocked
      if (userType === 'super_admin') {
        return true;
      }

      // Default: check if user is HR
      const userRoleName = await this.getUserActiveRoleName(userId, companyId);
      if (userRoleName) {
        const lowerName = userRoleName.toLowerCase();
        if (lowerName === 'hr' || lowerName === 'hr manager' || lowerName.includes('hr')) {
          return true;
        }
      }

      // Default: check if user is a reporting manager of any member
      const emp = await this.employeeModel.findOne({ where: { userId, companyId } });
      if (emp) {
        const isManager = await this.checkIfIsManagerOfAnyMember(conversationId, emp.id);
        if (isManager) return true;
      }

      return false;
    }

    // Evaluate overrides in DB
    const userRoleName = await this.getUserActiveRoleName(userId, companyId);
    const emp = await this.employeeModel.findOne({ where: { userId, companyId } });

    for (const ov of overrides) {
      if (ov.principalType === PrincipalType.ROLE && userRoleName) {
        if (userRoleName.toLowerCase() === ov.principalId?.toLowerCase()) {
          return true;
        }
        if (userType === 'super_admin' && ['admin', 'super_admin', 'super_admin_role'].includes(ov.principalId?.toLowerCase() || '')) {
          return true;
        }
      }

      if (ov.principalType === PrincipalType.EMPLOYEE) {
        if (Number(ov.principalId) === userId || (emp && Number(ov.principalId) === emp.id)) {
          return true;
        }
      }

      if (ov.principalType === PrincipalType.DEPARTMENT && emp) {
        if (Number(ov.principalId) === emp.departmentId) {
          return true;
        }
      }

      if (ov.principalType === PrincipalType.DESIGNATION && emp) {
        if (Number(ov.principalId) === emp.designationId) {
          return true;
        }
      }

      if (ov.principalType === PrincipalType.BRANCH && emp) {
        if (Number(ov.principalId) === emp.branchId) {
          return true;
        }
      }

      if (ov.principalType === PrincipalType.REPORTING_MANAGER && emp) {
        const isManager = await this.checkIfIsManagerOfAnyMember(conversationId, emp.id);
        if (isManager) return true;
      }
    }

    return false;
  }

  /**
   * Helper to retrieve active user role name in a company
   */
  private async getUserActiveRoleName(userId: number, companyId: number): Promise<string | null> {
    const membership = await this.userCompanyModel.findOne({
      where: { userId, companyId, status: 'Active' },
      include: [{ model: this.roleModel, where: { isActive: true }, required: true }],
    });
    return membership && membership.role ? membership.role.name : null;
  }

  /**
   * Helper to verify if an employee is the manager of any member currently in the group
   */
  private async checkIfIsManagerOfAnyMember(conversationId: number, managerId: number): Promise<boolean> {
    const isManagerOfMember = await this.memberModel.findOne({
      where: { conversationId },
      include: [{
        model: this.userModel,
        required: true,
        include: [{
          model: this.employeeModel,
          required: true,
          where: { managerId },
        }],
      }],
    });
    return !!isManagerOfMember;
  }

  /**
   * API/View Auth Check
   */
  async canView(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess && conversation) {
      const security = this.resolveSecurityFlags(conversation);
      if (security.hideApi || conversation.visibility === VisibilityType.HIDDEN) {
        throw new NotFoundException('Conversation not found.');
      }
      throw new ForbiddenException('You do not have permission to view this conversation.');
    }
    return hasAccess;
  }

  /**
   * Send Message Auth Check
   */
  async canSend(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) {
      throw new ForbiddenException('You cannot send messages to this conversation.');
    }

    // Check if the conversation is frozen
    if (conversation.isFrozen) {
      throw new ForbiddenException('This conversation is frozen and read-only.');
    }

    // Check general setting for sending
    if (conversation.settings && !conversation.settings.allowSend) {
      throw new ForbiddenException('Message sending is disabled in this conversation settings.');
    }

    // If they are a member, verify postingPolicy or admin mode
    if (member) {
      const isPrivileged = ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'ADMIN', 'MODERATOR'].includes(member.role);
      if (conversation.isLocked && !isPrivileged) {
        throw new ForbiddenException('This conversation is locked by an administrator.');
      }
      if (conversation.announcementMode && !isPrivileged) {
        throw new ForbiddenException('Only administrators can post in announcement channels.');
      }
    } else {
      // Non-member trying to send via overrides: verify if they have write permission override
      const hasWriteOverride = await this.checkPermissionOverrides(conversationId, userId, companyId, userType, 'POST');
      if (!hasWriteOverride) {
        throw new ForbiddenException('You do not have posting permission in this conversation.');
      }
    }

    return true;
  }

  /**
   * Delete Message Auth Check
   */
  async canDeleteMessage(
    conversationId: number,
    user: any,
    companyId: number,
    messageSenderId: number | null,
  ): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied.');
    }

    if (conversation.isFrozen) {
      throw new ForbiddenException('This conversation is frozen and read-only.');
    }

    if (conversation.legalHoldActive) {
      throw new ForbiddenException('This conversation is under compliance legal hold. Deleting is disabled.');
    }

    // If deleting their own message
    if (messageSenderId && Number(messageSenderId) === Number(userId)) {
      if (conversation.settings && !conversation.settings.allowDelete) {
        throw new ForbiddenException('Message deletion is disabled.');
      }
      return true;
    }

    // Deleting someone else's message: requires OWNER/ADMIN roles
    if (member) {
      const isPrivileged = ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'ADMIN'].includes(member.role);
      if (isPrivileged) return true;
    }

    throw new ForbiddenException('You do not have permission to delete this message.');
  }

  /**
   * Edit Message Auth Check
   */
  async canEditMessage(
    conversationId: number,
    user: any,
    companyId: number,
    messageSenderId: number | null,
  ): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied.');
    }

    if (conversation.isFrozen) {
      throw new ForbiddenException('This conversation is frozen and read-only.');
    }

    if (conversation.settings && !conversation.settings.allowEdit) {
      throw new ForbiddenException('Message editing is disabled in this conversation.');
    }

    if (messageSenderId && Number(messageSenderId) !== Number(userId)) {
      throw new ForbiddenException('You can only edit your own messages.');
    }

    return true;
  }

  /**
   * Generic Action Helper based on ActionPolicy
   */
  private verifyActionPolicy(policy: ActionPolicy, memberRole: string): boolean {
    if (policy === ActionPolicy.OWNER) {
      return ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'OWNER_COMPLIANCE', 'OWNER_TECHNICAL'].includes(memberRole);
    }
    if (policy === ActionPolicy.ADMIN) {
      return ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'OWNER_COMPLIANCE', 'OWNER_TECHNICAL', 'ADMIN'].includes(memberRole);
    }
    // MEMBER level
    return ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'OWNER_COMPLIANCE', 'OWNER_TECHNICAL', 'ADMIN', 'MODERATOR', 'MEMBER'].includes(memberRole);
  }

  /**
   * Management Actions: Rename, Change Icon, Change Desc, Archive, Delete
   */
  async canRename(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to manage settings.');

    return this.verifyActionPolicy(conversation.renamePolicy, member.role);
  }

  async canChangeIcon(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to manage settings.');

    return this.verifyActionPolicy(conversation.iconPolicy, member.role);
  }

  async canChangeDesc(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to manage settings.');

    return this.verifyActionPolicy(conversation.descPolicy, member.role);
  }

  async canArchive(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to archive.');

    return this.verifyActionPolicy(conversation.archivePolicy, member.role);
  }

  async canDelete(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.legalHoldActive) {
      throw new ForbiddenException('This conversation is under compliance legal hold. Deletion is disabled.');
    }

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to delete.');

    return this.verifyActionPolicy(conversation.deletePolicy, member.role);
  }

  /**
   * Membership Operations
   */
  async canInvite(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to invite.');

    return this.verifyActionPolicy(conversation.invitePolicy, member.role);
  }

  async canRemoveMember(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to remove users.');

    return this.verifyActionPolicy(conversation.removeMemberPolicy, member.role);
  }

  /**
   * Pinning Messages
   */
  async canPinMessage(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.isFrozen) throw new ForbiddenException('Conversation is frozen.');

    if (conversation.settings && !conversation.settings.allowPin) {
      throw new ForbiddenException('Pinning is disabled in conversation settings.');
    }

    if (userType === 'super_admin') return true;

    if (!member) throw new ForbiddenException('You must be a member to pin messages.');

    return this.verifyActionPolicy(conversation.settings?.pinPolicy || ActionPolicy.MEMBER, member.role);
  }

  /**
   * Attachment Downloads
   */
  async canDownload(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this conversation files.');
    }

    if (conversation.settings && !conversation.settings.allowDownload) {
      throw new ForbiddenException('Downloads are disabled in this conversation settings.');
    }

    // Check fileVisibility policy
    if (conversation.fileVisibility === 'DOWNLOAD_RESTRICTED') {
      if (userType === 'super_admin') return true;
      if (member) {
        const isPrivileged = ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'ADMIN'].includes(member.role);
        if (isPrivileged) return true;
      }
      throw new ForbiddenException('File downloads are restricted to owners and administrators.');
    }

    return true;
  }

  /**
   * Chat Export
   */
  async canExport(conversationId: number, user: any, companyId: number): Promise<boolean> {
    const userId = user.userId || user.id;
    const userType = user.type || '';
    const { hasAccess, conversation, member } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) throw new ForbiddenException('Access denied.');

    if (conversation.settings && !conversation.settings.allowExport) {
      throw new ForbiddenException('Exporting is disabled in conversation settings.');
    }

    if (userType === 'super_admin') return true;

    // Check export policy
    const policy = conversation.exportPolicy;
    if (policy === ExportPolicy.NOBODY) {
      throw new ForbiddenException('Exporting is disabled for this conversation.');
    }

    if (member) {
      if (policy === ExportPolicy.OWNER && ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY'].includes(member.role)) {
        return true;
      }
      if (policy === ExportPolicy.ADMIN && ['OWNER', 'OWNER_PRIMARY', 'OWNER_SECONDARY', 'ADMIN'].includes(member.role)) {
        return true;
      }
    }

    // Compliance team check
    if (policy === ExportPolicy.COMPLIANCE_TEAM) {
      const userRoleName = await this.getUserActiveRoleName(userId, companyId);
      if (userRoleName) {
        const lowerName = userRoleName.toLowerCase();
        if (lowerName.includes('compliance') || lowerName.includes('legal') || lowerName === 'admin') {
          return true;
        }
      }
    }

    throw new ForbiddenException('You do not have permission to export this chat.');
  }

  /**
   * Socket join verification
   */
  async canJoinSocket(conversationId: number, userId: number, companyId: number, isSuperAdmin: boolean): Promise<boolean> {
    const userType = isSuperAdmin ? 'super_admin' : 'standard';
    const { hasAccess, isMember, conversation } = await this.checkConversationAccess(conversationId, userId, companyId, userType);
    if (!hasAccess) return false;

    // If socket is hidden/protected for non-members
    const security = this.resolveSecurityFlags(conversation);
    if (security.hideSocket && !isMember) {
      const hasOverride = await this.checkPermissionOverrides(conversationId, userId, companyId, userType, 'VIEW');
      if (!hasOverride) {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper to retrieve all accessible conversation IDs for a user inside a company.
   * Leverages caching and delegates permission evaluations to checkConversationAccess.
   */
  async getAccessibleConversationIds(userId: number, companyId: number, userType: string): Promise<number[]> {
    const cacheKey = `accessible_conversations:${companyId}:${userId}`;
    const cached = this.accessibleIdsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    if (!this.conversationModel.sequelize) return [];

    // Query candidate conversations:
    // 1. Where the user is a member
    // 2. Or visibility is PUBLIC
    // 3. Or at least one override exists in the permission overrides table
    const sql = `
      SELECT id FROM conversations 
      WHERE "companyId" = :companyId 
        AND "deletedAt" IS NULL
        AND (
          id IN (SELECT "conversationId" FROM conversation_members WHERE "userId" = :userId)
          OR visibility = 'PUBLIC'
          OR id IN (SELECT "conversationId" FROM conversation_permission_overrides)
        )
    `;

    const candidates = await this.conversationModel.sequelize.query(sql, {
      replacements: { companyId, userId },
      type: 'SELECT',
    }) as { id: number }[];

    const accessibleIds: number[] = [];

    await Promise.all(
      candidates.map(async (c) => {
        const { hasAccess } = await this.checkConversationAccess(c.id, userId, companyId, userType);
        if (hasAccess) {
          accessibleIds.push(c.id);
        }
      })
    );

    // Cache the result for 60 seconds
    this.accessibleIdsCache.set(cacheKey, {
      ids: accessibleIds,
      expiresAt: Date.now() + 60000,
    });

    return accessibleIds;
  }

  /**
   * Targeted cache invalidation
   */
  clearCache(companyId?: number, userId?: number) {
    if (userId !== undefined && companyId !== undefined) {
      const key = `accessible_conversations:${companyId}:${userId}`;
      this.accessibleIdsCache.delete(key);
    } else if (companyId !== undefined) {
      const prefix = `accessible_conversations:${companyId}:`;
      for (const key of this.accessibleIdsCache.keys()) {
        if (key.startsWith(prefix)) {
          this.accessibleIdsCache.delete(key);
        }
      }
    } else {
      this.accessibleIdsCache.clear();
    }
  }

  // Event Listeners for targeted cache invalidation
  @OnEvent(ChatEventNames.CONVERSATION_CREATED)
  @OnEvent(ChatEventNames.CONVERSATION_UPDATED)
  @OnEvent(ChatEventNames.CONVERSATION_ARCHIVED)
  handleCompanyCacheClear(event: any) {
    if (event && event.companyId) {
      this.clearCache(event.companyId);
    }
  }

  @OnEvent(ChatEventNames.MEMBER_ADDED)
  handleMemberAddedCacheClear(event: any) {
    if (event && event.companyId && event.member?.userId) {
      this.clearCache(event.companyId, event.member.userId);
    }
  }

  @OnEvent(ChatEventNames.MEMBER_REMOVED)
  handleMemberRemovedCacheClear(event: any) {
    if (event && event.companyId && event.userId) {
      this.clearCache(event.companyId, event.userId);
    }
  }
}
