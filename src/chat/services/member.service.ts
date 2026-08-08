import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { User } from '../../users/models/user.model';
import { Message } from '../models/message.model';
import { AddMemberDto, UpdateMemberRoleDto, MuteMemberDto } from '../dto/chat.dto';
import { MemberRole, MessageType } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import {
  ChatEventNames,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleUpdatedEvent,
  MemberMutedEvent,
  MessageCreatedEvent,
} from '../events/chat.events';
import { PolicyService } from './policy.service';

@Injectable()
export class MemberService {
  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Message)
    private readonly messageModel: typeof Message,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly policyService: PolicyService,
  ) {}

  async addMember(
    conversationId: number,
    companyId: number,
    dto: AddMemberDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<ConversationMember> {
    await this.policyService.canInvite(conversationId, actor, companyId);

    const conversation = await this.conversationModel.findOne({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const userToAdd = await this.userModel.findOne({
      where: { id: dto.userId, clientId: actor.clientId, isActive: true },
    });

    if (!userToAdd) {
      throw new NotFoundException('User not found or is inactive.');
    }

    const existingMember = await this.memberModel.findOne({
      where: { conversationId, userId: dto.userId },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member of this conversation.');
    }

    const member = await this.memberModel.create({
      conversationId,
      userId: dto.userId,
      role: MemberRole.MEMBER,
      isMuted: false,
      isNotificationMuted: false,
      joinedAt: new Date(),
    } as any);

    // Audit Log
    await this.auditService.writeLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'ConversationMember',
      entityId: member.id,
      action: 'ADD_MEMBER',
      newValue: { conversationId, userId: dto.userId, role: member.role },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Create Notification
    await this.notificationsService.createNotification(
      {
        recipients: [dto.userId],
        type: NotificationType.CHAT,
        referenceType: 'conversation',
        referenceId: conversationId,
        title: `You were added to conversation: ${conversation.name || 'New Group'}`,
        category: 'SYSTEM',
        payload: {
          conversationId,
          addedBy: actor.userId,
        },
      },
      actor.userId,
    );

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MEMBER_ADDED,
      new MemberAddedEvent(conversationId, companyId, member),
    );

    // Create system message for member added
    const userAddedName = userToAdd ? userToAdd.name : 'A member';
    let systemMessageContent = '';
    if (Number(actor.userId) === Number(dto.userId)) {
      systemMessageContent = `${userAddedName} joined the group.`;
    } else {
      const actorUser = await this.userModel.findByPk(actor.userId);
      const actorName = actorUser ? actorUser.name : 'Admin';
      systemMessageContent = `${userAddedName} was added to the group by ${actorName}.`;
    }

    const systemMessage = await this.messageModel.create({
      conversationId,
      senderId: null,
      content: systemMessageContent,
      type: MessageType.SYSTEM,
      payload: { isSystem: true },
      isEdited: false,
      version: 1,
      isDeleted: false,
    } as any);

    // Force updatedAt update on conversation to bubble to top
    await this.conversationModel.update(
      { updatedAt: new Date() },
      { where: { id: conversationId } }
    );

    // Broadcast system message
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_CREATED,
      new MessageCreatedEvent(conversationId, companyId, systemMessage),
    );

    return member;
  }

  async removeMember(
    conversationId: number,
    companyId: number,
    userId: number,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    if (Number(actor.userId) !== Number(userId)) {
      await this.policyService.canRemoveMember(conversationId, actor, companyId);
    }

    const conversation = await this.conversationModel.findOne({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    if (member.role === MemberRole.OWNER) {
      throw new BadRequestException('Cannot remove the owner of the conversation.');
    }

    await member.destroy();

    // Audit Log
    await this.auditService.writeLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'ConversationMember',
      entityId: member.id,
      action: 'REMOVE_MEMBER',
      oldValue: { conversationId, userId, role: member.role },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Create system message for member leaving / removed
    const userRemoved = await this.userModel.findByPk(userId);
    const userRemovedName = userRemoved ? userRemoved.name : 'A member';

    let systemMessageContent = '';
    if (Number(actor.userId) === Number(userId)) {
      systemMessageContent = `${userRemovedName} has left the group.`;
    } else {
      const actorUser = await this.userModel.findByPk(actor.userId);
      const actorName = actorUser ? actorUser.name : 'Admin';
      systemMessageContent = `${userRemovedName} was removed from the group by ${actorName}.`;
    }

    const systemMessage = await this.messageModel.create({
      conversationId,
      senderId: null,
      content: systemMessageContent,
      type: MessageType.SYSTEM,
      payload: { isSystem: true },
      isEdited: false,
      version: 1,
      isDeleted: false,
    } as any);

    // Force updatedAt update on conversation to bubble to top
    await this.conversationModel.update(
      { updatedAt: new Date() },
      { where: { id: conversationId } }
    );

    // Broadcast system message
    this.eventEmitter.emit(
      ChatEventNames.MESSAGE_CREATED,
      new MessageCreatedEvent(conversationId, companyId, systemMessage),
    );

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MEMBER_REMOVED,
      new MemberRemovedEvent(conversationId, companyId, userId),
    );
  }

  async updateRole(
    conversationId: number,
    companyId: number,
    userId: number,
    dto: UpdateMemberRoleDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<ConversationMember> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
      include: [Conversation],
    });

    if (!member || member.conversation.companyId !== companyId) {
      throw new NotFoundException('Membership not found inside this company workspace.');
    }

    const oldRole = member.role;
    if (oldRole === MemberRole.OWNER && dto.role !== MemberRole.OWNER) {
      throw new BadRequestException('Cannot change the role of the conversation owner.');
    }

    member.role = dto.role;
    await member.save();

    // Audit Log
    await this.auditService.writeLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'ConversationMember',
      entityId: member.id,
      action: 'UPDATE_ROLE',
      oldValue: { role: oldRole },
      newValue: { role: dto.role },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Notify Role change
    await this.notificationsService.createNotification(
      {
        recipients: [userId],
        type: NotificationType.CHAT,
        referenceType: 'conversation',
        referenceId: conversationId,
        title: `Your role was updated to ${dto.role} inside group: ${member.conversation.name || 'Conversation'}`,
        category: 'SYSTEM',
        payload: {
          conversationId,
          newRole: dto.role,
        },
      },
      actor.userId,
    );

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MEMBER_ROLE_UPDATED,
      new MemberRoleUpdatedEvent(conversationId, companyId, userId, dto.role),
    );

    return member;
  }

  async muteMember(
    conversationId: number,
    companyId: number,
    userId: number,
    dto: MuteMemberDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<ConversationMember> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
      include: [Conversation],
    });

    if (!member || member.conversation.companyId !== companyId) {
      throw new NotFoundException('Membership not found inside this company workspace.');
    }

    member.isMuted = dto.mute;
    if (dto.mute) {
      if (dto.durationMinutes) {
        const until = new Date();
        until.setMinutes(until.getMinutes() + dto.durationMinutes);
        member.mutedUntil = until;
      } else {
        member.mutedUntil = null;
      }
    } else {
      member.mutedUntil = null;
    }

    await member.save();

    // Audit Log
    await this.auditService.writeLog({
      clientId: actor.clientId,
      companyId,
      userId: actor.userId,
      entityType: 'ConversationMember',
      entityId: member.id,
      action: dto.mute ? 'MUTE_MEMBER' : 'UNMUTE_MEMBER',
      newValue: { isMuted: dto.mute, mutedUntil: member.mutedUntil },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // EMIT DOMAIN EVENT
    this.eventEmitter.emit(
      ChatEventNames.MEMBER_MUTED,
      new MemberMutedEvent(conversationId, companyId, userId, dto.mute, member.mutedUntil),
    );

    return member;
  }

  // ── Pin / Unpin a conversation (per-user preference) ──────────────────────

  async pinConversation(
    conversationId: number,
    userId: number,
  ): Promise<{ isPinned: boolean }> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    member.isPinned = true;
    await member.save();

    return { isPinned: true };
  }

  async unpinConversation(
    conversationId: number,
    userId: number,
  ): Promise<{ isPinned: boolean }> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    member.isPinned = false;
    await member.save();

    return { isPinned: false };
  }


  // ── Self mute/unmute notifications ──

  async muteSelf(
    conversationId: number,
    userId: number,
    mute: boolean,
  ): Promise<{ isMuted: boolean }> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    member.isNotificationMuted = mute;
    if (!mute && member.isMuted && member.mutedUntil === null) {
      member.isMuted = false;
    }
    await member.save();

    return { isMuted: member.isMuted, isNotificationMuted: member.isNotificationMuted } as any;
  }

  // ── Favorite / Unfavorite a conversation ──

  async favoriteConversation(
    conversationId: number,
    userId: number,
  ): Promise<{ isFavorite: boolean }> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    member.isFavorite = true;
    await member.save();

    return { isFavorite: true };
  }

  async unfavoriteConversation(
    conversationId: number,
    userId: number,
  ): Promise<{ isFavorite: boolean }> {
    const member = await this.memberModel.findOne({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new NotFoundException('Membership not found.');
    }

    member.isFavorite = false;
    await member.save();

    return { isFavorite: false };
  }
}

