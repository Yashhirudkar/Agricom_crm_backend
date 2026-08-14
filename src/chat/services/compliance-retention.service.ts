import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Message } from '../models/message.model';
import { MessageVersion } from '../models/message-version.model';
import { MessageAttachment } from '../models/message-attachment.model';
import { MessageReaction } from '../models/message-reaction.model';
import { Conversation } from '../models/conversation.model';
import { ChatPolicy } from '../models/chat-policy.model';
import { User } from '../../users/models/user.model';
import { ChatPolicyService } from './chat-policy.service';

@Injectable()
export class ComplianceRetentionService {
  private readonly logger = new Logger(ComplianceRetentionService.name);

  constructor(
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    private readonly policyService: ChatPolicyService,
  ) {}

  /**
   * Run automated retention cleanup (Prunes messages exceeding retentionDays unless Legal Hold is active)
   */
  async executeRetentionCleanup(companyId: number): Promise<{ prunedCount: number }> {
    const policy = await this.policyService.getCompanyPolicy(companyId);

    if (policy.legalHoldActive) {
      this.logger.warn(`Retention cleanup skipped for company ${companyId} due to active Legal Hold.`);
      return { prunedCount: 0 };
    }

    if (!policy.retentionDays || policy.retentionDays <= 0) {
      return { prunedCount: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const conversations = await this.conversationRepository.findAll({
      where: { companyId },
      attributes: ['id'],
    });
    const convIds = conversations.map((c) => c.id);

    if (convIds.length === 0) {
      return { prunedCount: 0 };
    }

    const deleted = await this.messageRepository.destroy({
      where: {
        conversationId: { [Op.in]: convIds },
        createdAt: { [Op.lt]: cutoffDate },
      },
    });

    this.logger.log(`Pruned ${deleted} expired messages for company ${companyId}.`);
    return { prunedCount: deleted };
  }

  /**
   * Export conversation audit transcript with full edit history
   */
  async exportTranscript(
    conversationId: number,
    companyId: number,
    requestingUser: { id: number; name?: string },
  ) {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, companyId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const policy = await this.policyService.getCompanyPolicy(companyId);
    if (!policy.allowExport) {
      throw new ForbiddenException('Message export is disabled by company policy');
    }

    const messages = await this.messageRepository.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: MessageAttachment, as: 'attachments' },
        { model: MessageReaction, as: 'reactions' },
        { model: MessageVersion, as: 'versions' },
      ],
    });

    return {
      exportedAt: new Date().toISOString(),
      exportedBy: requestingUser,
      conversation: {
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
        createdAt: conversation.createdAt,
      },
      totalMessages: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender ? { id: m.sender.id, name: m.sender.name, email: m.sender.email } : 'SYSTEM',
        content: m.content,
        type: m.type,
        version: m.version,
        isEdited: m.isEdited,
        editHistory: m.versions || [],
        reactions: m.reactions || [],
        attachments: m.attachments || [],
        createdAt: m.createdAt,
      })),
    };
  }
}
