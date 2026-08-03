import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ScheduledMessage } from '../models/scheduled-message.model';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { MessageService } from './message.service';
import { CreateScheduledMessageDto } from '../dto/scheduled-message.dto';
import { IScheduledMessageDispatcher } from './scheduled-message-dispatcher.interface';
import { MemberRole } from '../constants/chat.constants';

@Injectable()
export class ScheduledMessageService implements IScheduledMessageDispatcher, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledMessageService.name);
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(ScheduledMessage)
    private readonly scheduledRepository: typeof ScheduledMessage,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    private readonly messageService: MessageService,
    private readonly sequelize: Sequelize,
  ) {
    // Start background poll every 15 seconds (future-compatible with BullMQ)
    this.intervalTimer = setInterval(() => {
      this.dispatchDueMessages().catch((err) => {
        this.logger.error(`Error in dispatchDueMessages: ${err.message}`);
      });
    }, 15000);
  }

  onModuleDestroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Schedule a message for future broadcast
   */
  async scheduleMessage(
    conversationId: number,
    dto: CreateScheduledMessageDto,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const targetDate = new Date(dto.scheduledFor);
    if (isNaN(targetDate.getTime()) || targetDate <= new Date()) {
      throw new BadRequestException('Scheduled date must be in the future.');
    }

    const conversation = await this.conversationRepository.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.isLocked) {
      throw new ForbiddenException('Conversation is locked');
    }

    const record = await this.scheduledRepository.create({
      conversationId,
      senderId: actor.id,
      content: dto.content,
      type: dto.type,
      payload: dto.payload || null,
      scheduledFor: targetDate,
      isSent: false,
    } as any);

    return record;
  }

  /**
   * Cancel / Delete a scheduled message
   */
  async cancelScheduled(scheduledMessageId: number, requestingUserId?: number): Promise<boolean> {
    const scheduled = await this.scheduledRepository.findByPk(scheduledMessageId);
    if (!scheduled) {
      throw new NotFoundException('Scheduled message not found');
    }

    if (scheduled.isSent) {
      throw new BadRequestException('Message has already been dispatched');
    }

    if (requestingUserId && scheduled.senderId !== requestingUserId) {
      const member = await this.memberRepository.findOne({
        where: { conversationId: scheduled.conversationId, userId: requestingUserId },
      });
      const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN];
      if (!member || !allowedRoles.includes(member.role)) {
        throw new ForbiddenException('You can only cancel your own scheduled messages');
      }
    }

    await scheduled.destroy();
    return true;
  }

  /**
   * Get pending scheduled messages for user in conversation
   */
  async getScheduledMessages(conversationId: number, userId: number) {
    return this.scheduledRepository.findAll({
      where: {
        conversationId,
        senderId: userId,
        isSent: false,
      },
      order: [['scheduledFor', 'ASC']],
    });
  }

  /**
   * Dispatch all due messages
   */
  async dispatchDueMessages(): Promise<number> {
    const now = new Date();
    const dueMessages = await this.scheduledRepository.findAll({
      where: {
        scheduledFor: { [Op.lte]: now },
        isSent: false,
      },
      limit: 100,
    });

    if (dueMessages.length === 0) {
      return 0;
    }

    let dispatchedCount = 0;

    for (const msg of dueMessages) {
      try {
        const conversation = await this.conversationRepository.findByPk(msg.conversationId);
        if (!conversation) {
          msg.isSent = true;
          await msg.save();
          continue;
        }

        // Send message using MessageService
        await this.messageService.send(
          msg.conversationId,
          conversation.companyId,
          {
            content: msg.content,
            type: msg.type as any,
            payload: msg.payload,
          },
          {
            userId: msg.senderId,
            clientId: conversation.clientId,
          },
        );

        msg.isSent = true;
        msg.sentAt = new Date();
        await msg.save();
        dispatchedCount++;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch scheduled message ID ${msg.id}: ${err.message}`,
        );
      }
    }

    return dispatchedCount;
  }
}
