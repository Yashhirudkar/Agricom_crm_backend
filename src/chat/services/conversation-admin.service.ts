import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { ConversationLabel } from '../models/conversation-label.model';
import { ConversationLabelMap } from '../models/conversation-label-map.model';
import { Message } from '../models/message.model';
import { User } from '../../users/models/user.model';
import { MemberRole, MessageType } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import {
  ChatEventNames,
  ConversationFrozenEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  MessageCreatedEvent,
} from '../events/chat.events';

@Injectable()
export class ConversationAdminService {
  private readonly logger = new Logger(ConversationAdminService.name);

  constructor(
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    @InjectModel(ConversationLabel)
    private readonly labelRepository: typeof ConversationLabel,
    @InjectModel(ConversationLabelMap)
    private readonly labelMapRepository: typeof ConversationLabelMap,
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(User)
    private readonly userRepository: typeof User,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Create a global, company, or personal label
   */
  async createLabel(
    companyId: number,
    userId: number,
    dto: { name: string; color?: string; scope?: 'GLOBAL' | 'COMPANY' | 'PERSONAL' },
  ): Promise<ConversationLabel> {
    const scope = dto.scope || 'COMPANY';
    return this.labelRepository.create({
      companyId: scope === 'PERSONAL' ? null : companyId,
      userId: scope === 'PERSONAL' ? userId : null,
      name: dto.name,
      color: dto.color || '#4F46E5',
      scope,
    } as any);
  }

  /**
   * Get accessible labels for user (Company + Personal)
   */
  async getLabels(companyId: number, userId: number): Promise<ConversationLabel[]> {
    return this.labelRepository.findAll({
      where: {
        [Op.or]: [
          { companyId, scope: 'COMPANY' },
          { scope: 'GLOBAL' },
          { userId, scope: 'PERSONAL' },
        ],
      },
      order: [['name', 'ASC']],
    });
  }

  /**
   * Tag conversation with label
   */
  async assignLabel(conversationId: number, labelId: number): Promise<void> {
    await this.labelMapRepository.findOrCreate({
      where: { conversationId, labelId },
      defaults: { conversationId, labelId } as any,
    });
  }

  /**
   * Untag conversation label
   */
  async removeLabel(conversationId: number, labelId: number): Promise<void> {
    await this.labelMapRepository.destroy({
      where: { conversationId, labelId },
    });
  }

  /**
   * Get all labels attached to conversation
   */
  async getConversationLabels(conversationId: number): Promise<ConversationLabel[]> {
    const maps = await this.labelMapRepository.findAll({
      where: { conversationId },
      include: [{ model: ConversationLabel, as: 'label' }],
    });
    return maps.map((m) => m.label).filter(Boolean);
  }

  /**
   * Freeze / Unfreeze conversation (Locks all sending/mutations)
   */
  async setConversationFreeze(
    conversationId: number,
    isFrozen: boolean,
    actor: { id: number; name?: string; companyId: number },
  ) {
    const conv = await this.conversationRepository.findByPk(conversationId);
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    const member = await this.memberRepository.findOne({
      where: { conversationId, userId: actor.id },
    });
    const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN];
    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Only channel owner or admins can freeze conversation');
    }

    conv.isLocked = isFrozen;
    await conv.save();

    await this.auditService.writeLog({
      clientId: null,
      companyId: actor.companyId,
      userId: actor.id,
      action: isFrozen ? 'FREEZE_CONVERSATION' : 'UNFREEZE_CONVERSATION',
      entityType: 'CONVERSATION',
      entityId: conversationId,
      newValue: { isFrozen },
    });

    this.eventEmitter.emit(
      ChatEventNames.CONVERSATION_FROZEN,
      new ConversationFrozenEvent(conversationId, actor.companyId, isFrozen, actor.id),
    );

    return { success: true, isFrozen };
  }

  /**
   * Transfer conversation ownership
   */
  async transferOwnership(
    conversationId: number,
    newOwnerUserId: number,
    actor: { id: number; name?: string; companyId: number },
  ) {
    const currentOwner = await this.memberRepository.findOne({
      where: { conversationId, userId: actor.id, role: MemberRole.OWNER },
    });
    if (!currentOwner) {
      throw new ForbiddenException('Only current owner can transfer ownership');
    }

    const targetMember = await this.memberRepository.findOne({
      where: { conversationId, userId: newOwnerUserId },
    });
    if (!targetMember) {
      throw new BadRequestException('Target user is not a member of this conversation');
    }

    await this.sequelize.transaction(async (t) => {
      currentOwner.role = MemberRole.ADMIN;
      await currentOwner.save({ transaction: t });

      targetMember.role = MemberRole.OWNER;
      await targetMember.save({ transaction: t });

      await this.auditService.writeLog({
        clientId: null,
        companyId: actor.companyId,
        userId: actor.id,
        action: 'TRANSFER_OWNERSHIP',
        entityType: 'CONVERSATION',
        entityId: conversationId,
        newValue: { previousOwner: actor.id, newOwner: newOwnerUserId },
      });
    });

    return { success: true, newOwnerId: newOwnerUserId };
  }

  /**
   * Bulk add members to conversation
   */
  async bulkAddMembers(
    conversationId: number,
    userIds: number[],
    role: MemberRole = MemberRole.MEMBER,
    actor: { id: number; name?: string; companyId: number },
  ) {
    const existing = await this.memberRepository.findAll({
      where: { conversationId, userId: { [Op.in]: userIds } },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAddIds = userIds.filter((id) => !existingIds.has(id));

    if (toAddIds.length === 0) {
      return { addedCount: 0 };
    }

    const rows = toAddIds.map((uId) => ({
      conversationId,
      userId: uId,
      role,
      joinedAt: new Date(),
    }));

    await this.memberRepository.bulkCreate(rows as any);

    const addedUsers = await this.userRepository.findAll({
      where: { id: { [Op.in]: toAddIds } },
      attributes: ['id', 'name'],
    });

    let actorName = actor.name;
    if (!actorName) {
      const actorUser = await this.userRepository.findByPk(actor.id);
      actorName = actorUser ? actorUser.name : 'Admin';
    }

    for (const uId of toAddIds) {
      this.eventEmitter.emit(
        ChatEventNames.MEMBER_ADDED,
        new MemberAddedEvent(conversationId, actor.companyId, { userId: uId, role }),
      );

      const addedUser = addedUsers.find((u) => u.id === uId);
      const addedUserName = addedUser ? addedUser.name : 'A member';

      let systemMessageContent = '';
      if (Number(actor.id) === Number(uId)) {
        systemMessageContent = `${addedUserName} joined the group.`;
      } else {
        systemMessageContent = `${addedUserName} was added to the group by ${actorName}.`;
      }

      const systemMessage = await this.messageRepository.create({
        conversationId,
        senderId: null,
        content: systemMessageContent,
        type: MessageType.SYSTEM,
        payload: { isSystem: true },
        isEdited: false,
        version: 1,
        isDeleted: false,
      } as any);

      this.eventEmitter.emit(
        ChatEventNames.MESSAGE_CREATED,
        new MessageCreatedEvent(conversationId, actor.companyId, systemMessage),
      );
    }

    await this.conversationRepository.update(
      { updatedAt: new Date() },
      { where: { id: conversationId } }
    );

    return { addedCount: toAddIds.length, userIds: toAddIds };
  }

  /**
   * Bulk remove members from conversation
   */
  async bulkRemoveMembers(
    conversationId: number,
    userIds: number[],
    actor: { id: number; name?: string; companyId: number },
  ) {
    await this.memberRepository.destroy({
      where: {
        conversationId,
        userId: { [Op.in]: userIds },
        role: { [Op.ne]: MemberRole.OWNER }, // Protect owner from accidental removal
      },
    });

    for (const uId of userIds) {
      this.eventEmitter.emit(
        ChatEventNames.MEMBER_REMOVED,
        new MemberRemovedEvent(conversationId, actor.companyId, uId),
      );
    }

    return { removedCount: userIds.length };
  }
}
