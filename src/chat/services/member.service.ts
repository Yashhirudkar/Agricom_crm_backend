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
import { AddMemberDto, UpdateMemberRoleDto, MuteMemberDto } from '../dto/chat.dto';
import { MemberRole } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import {
  ChatEventNames,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleUpdatedEvent,
  MemberMutedEvent,
} from '../events/chat.events';

@Injectable()
export class MemberService {
  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
    @InjectModel(User)
    private readonly userModel: typeof User,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addMember(
    conversationId: number,
    companyId: number,
    dto: AddMemberDto,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<ConversationMember> {
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

    return member;
  }

  async removeMember(
    conversationId: number,
    companyId: number,
    userId: number,
    actor: { userId: number; clientId: number | null; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
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
}
