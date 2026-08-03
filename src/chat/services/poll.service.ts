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
import { MessagePoll } from '../models/message-poll.model';
import { MessagePollOption } from '../models/message-poll-option.model';
import { MessagePollVote } from '../models/message-poll-vote.model';
import { Message } from '../models/message.model';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';
import { User } from '../../users/models/user.model';
import { CreatePollDto, VotePollDto } from '../dto/poll.dto';
import { MessageType, MemberRole } from '../constants/chat.constants';
import { AuditService } from '../../audit/services/audit.service';
import { ConversationSummaryService } from './conversation-summary.service';
import {
  ChatEventNames,
  PollCreatedEvent,
  PollVotedEvent,
  PollClosedEvent,
} from '../events/chat.events';

@Injectable()
export class PollService {
  private readonly logger = new Logger(PollService.name);

  constructor(
    @InjectModel(MessagePoll)
    private readonly pollRepository: typeof MessagePoll,
    @InjectModel(MessagePollOption)
    private readonly optionRepository: typeof MessagePollOption,
    @InjectModel(MessagePollVote)
    private readonly voteRepository: typeof MessagePollVote,
    @InjectModel(Message)
    private readonly messageRepository: typeof Message,
    @InjectModel(Conversation)
    private readonly conversationRepository: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
    private readonly summaryService: ConversationSummaryService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Create a new Poll attached to a Message
   */
  async createPoll(
    conversationId: number,
    dto: CreatePollDto,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const conversation = await this.conversationRepository.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.isLocked) {
      throw new ForbiddenException('Conversation is locked');
    }

    let createdPoll: MessagePoll;
    let rootMessage: Message;

    await this.sequelize.transaction(async (t) => {
      // Create root message of type POLL
      rootMessage = await this.messageRepository.create(
        {
          conversationId,
          senderId: actor.id,
          content: `📊 Poll: ${dto.question}`,
          type: MessageType.POLL,
          payload: { question: dto.question, isAnonymous: !!dto.isAnonymous },
          isEdited: false,
          version: 1,
          isDeleted: false,
        } as any,
        { transaction: t },
      );

      // Create poll entity
      createdPoll = await this.pollRepository.create(
        {
          conversationId,
          messageId: rootMessage.id,
          question: dto.question,
          isAnonymous: !!dto.isAnonymous,
          allowMultiple: !!dto.allowMultiple,
          isClosed: false,
          createdBy: actor.id,
        } as any,
        { transaction: t },
      );

      // Create poll options
      const optionRows = dto.options.map((opt) => ({
        pollId: createdPoll.id,
        optionText: opt,
      }));
      await this.optionRepository.bulkCreate(optionRows as any, { transaction: t });

      // Audit
      await this.auditService.writeLog({
        userId: actor.id,
        companyId: conversation.companyId,
        clientId: actor.clientId,
        action: 'CREATE_POLL',
        entityType: 'MESSAGE_POLL',
        entityId: createdPoll.id,
        newValue: { question: dto.question, conversationId },
      });

      // Summary activity
      await this.summaryService.updateActivity(conversationId, t);
    });

    const fullPoll = await this.getPollDetails(createdPoll.id, actor.id);

    // Emit Domain Event
    this.eventEmitter.emit(
      ChatEventNames.POLL_CREATED,
      new PollCreatedEvent(conversationId, conversation.companyId, fullPoll),
    );

    return fullPoll;
  }

  /**
   * Cast a vote on a poll
   */
  async vote(
    pollId: number,
    dto: VotePollDto,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const poll = await this.pollRepository.findByPk(pollId, {
      include: [{ model: MessagePollOption, as: 'options' }],
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.isClosed) {
      throw new BadRequestException('This poll is closed and no longer accepting votes');
    }

    if (!poll.allowMultiple && dto.optionIds.length > 1) {
      throw new BadRequestException('This poll only allows single option selection');
    }

    // Verify optionIds belong to this poll
    const validOptionIds = new Set(poll.options.map((o) => o.id));
    for (const optId of dto.optionIds) {
      if (!validOptionIds.has(optId)) {
        throw new BadRequestException(`Option ID ${optId} does not belong to this poll`);
      }
    }

    await this.sequelize.transaction(async (t) => {
      // Clear existing votes for this user on this poll
      await this.voteRepository.destroy({
        where: { pollId, userId: actor.id },
        transaction: t,
      });

      // Insert new votes
      const voteRows = dto.optionIds.map((optId) => ({
        pollId,
        optionId: optId,
        userId: actor.id,
      }));
      await this.voteRepository.bulkCreate(voteRows as any, { transaction: t });
    });

    const results = await this.getPollResults(pollId, actor.id);

    // Emit Domain Event
    this.eventEmitter.emit(
      ChatEventNames.POLL_VOTED,
      new PollVotedEvent(poll.conversationId, actor.companyId, pollId, actor.id, results),
    );

    return results;
  }

  /**
   * Close a poll
   */
  async closePoll(
    pollId: number,
    actor: { id: number; name?: string; companyId: number; clientId: number },
  ) {
    const poll = await this.pollRepository.findByPk(pollId);
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.isClosed) {
      throw new BadRequestException('Poll is already closed');
    }

    // Check permission: creator or conversation owner/admin
    if (poll.createdBy !== actor.id) {
      const member = await this.memberRepository.findOne({
        where: { conversationId: poll.conversationId, userId: actor.id },
      });
      const allowedRoles = [MemberRole.OWNER, MemberRole.ADMIN];
      if (!member || !allowedRoles.includes(member.role)) {
        throw new ForbiddenException('Only poll creator or channel admins can close this poll');
      }
    }

    await this.sequelize.transaction(async (t) => {
      poll.isClosed = true;
      poll.closedAt = new Date();
      poll.closedBy = actor.id;
      await poll.save({ transaction: t });

      await this.auditService.writeLog({
        userId: actor.id,
        companyId: actor.companyId,
        clientId: actor.clientId,
        action: 'CLOSE_POLL',
        entityType: 'MESSAGE_POLL',
        entityId: poll.id,
        newValue: { conversationId: poll.conversationId },
      });
    });

    const finalResults = await this.getPollResults(pollId, actor.id);

    // Emit Domain Event
    this.eventEmitter.emit(
      ChatEventNames.POLL_CLOSED,
      new PollClosedEvent(
        poll.conversationId,
        actor.companyId,
        pollId,
        actor.id,
        finalResults,
      ),
    );

    return finalResults;
  }

  /**
   * Get poll details with calculated results
   */
  async getPollDetails(pollId: number, requestingUserId?: number) {
    return this.getPollResults(pollId, requestingUserId);
  }

  /**
   * Calculate poll results (counts, percentages, voter lists)
   */
  async getPollResults(pollId: number, requestingUserId?: number) {
    const poll = await this.pollRepository.findByPk(pollId, {
      include: [
        {
          model: MessagePollOption,
          as: 'options',
          include: [
            {
              model: MessagePollVote,
              as: 'votes',
              include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
            },
          ],
        },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'closer', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    let totalVotes = 0;
    for (const opt of poll.options) {
      totalVotes += opt.votes ? opt.votes.length : 0;
    }

    const myVotedOptionIds: number[] = [];

    const optionsResults = poll.options.map((opt) => {
      const voteCount = opt.votes ? opt.votes.length : 0;
      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

      if (requestingUserId && opt.votes) {
        if (opt.votes.some((v) => v.userId === requestingUserId)) {
          myVotedOptionIds.push(opt.id);
        }
      }

      return {
        id: opt.id,
        optionText: opt.optionText,
        voteCount,
        percentage,
        voters: poll.isAnonymous
          ? []
          : (opt.votes || []).map((v) => ({
              id: v.user?.id,
              name: v.user?.name,
              email: v.user?.email,
            })),
      };
    });

    return {
      id: poll.id,
      conversationId: poll.conversationId,
      messageId: poll.messageId,
      question: poll.question,
      isAnonymous: poll.isAnonymous,
      allowMultiple: poll.allowMultiple,
      isClosed: poll.isClosed,
      closedAt: poll.closedAt,
      creator: poll.creator,
      closer: poll.closer,
      totalVotes,
      options: optionsResults,
      myVotedOptionIds,
      createdAt: poll.createdAt,
    };
  }
}
