import { Injectable, Logger, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ChatEventNames,
  MessageCreatedEvent,
  MessageUpdatedEvent,
  MessageDeletedEvent,
  MessageReactedEvent,
  MessageReadEvent,
  MessagePinnedEvent,
  ThreadRepliedEvent,
  PollCreatedEvent,
  PollVotedEvent,
  PollClosedEvent,
  ConversationCreatedEvent,
  ConversationUpdatedEvent,
  ConversationArchivedEvent,
  ConversationLockedEvent,
  ConversationFrozenEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleUpdatedEvent,
  MemberMutedEvent,
} from '../events/chat.events';
import { ChatGateway } from '../gateways/chat.gateway';

@Injectable()
export class ChatEventsListener implements OnModuleDestroy {
  private readonly logger = new Logger(ChatEventsListener.name);

  // Read Receipt Batching Buffer: conversationId -> Map<userId, lastMessageId>
  private readReceiptBatch = new Map<number, Map<number, number>>();
  private batchFlushTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  onModuleDestroy() {
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // MESSAGE DOMAIN EVENT HANDLERS
  // --------------------------------------------------------------------------

  @OnEvent(ChatEventNames.MESSAGE_CREATED)
  handleMessageCreated(event: MessageCreatedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'message_created',
      {
        eventId: event.eventId,
        version: event.eventVersion,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        clientMessageId: event.clientMessageId,
        message: event.message,
      },
    );
  }

  @OnEvent(ChatEventNames.MESSAGE_UPDATED)
  handleMessageUpdated(event: MessageUpdatedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'message_updated',
      {
        eventId: event.eventId,
        version: event.eventVersion,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        messageId: event.messageId,
        message: event.message,
      },
    );
  }

  @OnEvent(ChatEventNames.MESSAGE_DELETED)
  handleMessageDeleted(event: MessageDeletedEvent) {
    if (event.mode === 'everyone') {
      this.chatGateway.broadcastToConversation(
        event.conversationId,
        'message_deleted',
        {
          eventId: event.eventId,
          version: event.eventVersion,
          timestamp: event.timestamp,
          conversationId: event.conversationId,
          messageId: event.messageId,
          deletedBy: event.deletedBy,
        },
      );
    }
  }

  @OnEvent(ChatEventNames.MESSAGE_REACTED)
  handleMessageReacted(event: MessageReactedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'message_reacted',
      {
        eventId: event.eventId,
        version: event.eventVersion,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        messageId: event.messageId,
        userId: event.userId,
        reaction: event.reaction,
        reactionRecord: event.reactionRecord,
      },
    );
  }

  @OnEvent(ChatEventNames.MESSAGE_PINNED)
  handleMessagePinned(event: MessagePinnedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'message_pinned',
      {
        eventId: event.eventId,
        version: event.eventVersion,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        messageId: event.messageId,
        pinnedBy: event.pinnedBy,
        isPinned: event.isPinned,
      },
    );
  }

  @OnEvent(ChatEventNames.MESSAGE_READ)
  handleMessageRead(event: MessageReadEvent) {
    if (!this.readReceiptBatch.has(event.conversationId)) {
      this.readReceiptBatch.set(event.conversationId, new Map());
    }
    this.readReceiptBatch.get(event.conversationId).set(event.userId, event.lastMessageId);

    if (!this.batchFlushTimer) {
      this.batchFlushTimer = setTimeout(() => this.flushReadReceipts(), 150);
    }
  }

  private flushReadReceipts() {
    this.batchFlushTimer = null;
    const currentBatches = this.readReceiptBatch;
    this.readReceiptBatch = new Map();

    for (const [conversationId, userReads] of currentBatches.entries()) {
      const receipts = Array.from(userReads.entries()).map(([userId, lastMessageId]) => ({
        userId,
        lastMessageId,
      }));

      this.chatGateway.broadcastToConversation(
        conversationId,
        'read_receipts_batch',
        {
          conversationId,
          receipts,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  // --------------------------------------------------------------------------
  // THREAD DOMAIN EVENT HANDLERS
  // --------------------------------------------------------------------------

  @OnEvent(ChatEventNames.THREAD_REPLIED)
  handleThreadReplied(event: ThreadRepliedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'thread_replied',
      {
        eventId: event.eventId,
        version: event.eventVersion,
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        parentMessageId: event.parentMessageId,
        replyMessage: event.replyMessage,
        threadSummary: event.threadSummary,
      },
    );
  }

  // --------------------------------------------------------------------------
  // POLL DOMAIN EVENT HANDLERS
  // --------------------------------------------------------------------------

  @OnEvent(ChatEventNames.POLL_CREATED)
  handlePollCreated(event: PollCreatedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'poll_created',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        poll: event.poll,
      },
    );
  }

  @OnEvent(ChatEventNames.POLL_VOTED)
  handlePollVoted(event: PollVotedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'poll_voted',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        pollId: event.pollId,
        userId: event.userId,
        pollResults: event.pollResults,
      },
    );
  }

  @OnEvent(ChatEventNames.POLL_CLOSED)
  handlePollClosed(event: PollClosedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'poll_closed',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        pollId: event.pollId,
        closedBy: event.closedBy,
        finalResults: event.finalResults,
      },
    );
  }

  // --------------------------------------------------------------------------
  // CONVERSATION DOMAIN EVENT HANDLERS
  // --------------------------------------------------------------------------

  @OnEvent(ChatEventNames.CONVERSATION_CREATED)
  handleConversationCreated(event: ConversationCreatedEvent) {
    this.chatGateway.broadcastToCompany(
      event.companyId,
      'conversation_created',
      {
        eventId: event.eventId,
        conversation: event.conversation,
      },
    );
  }

  @OnEvent(ChatEventNames.CONVERSATION_UPDATED)
  handleConversationUpdated(event: ConversationUpdatedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'conversation_updated',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        conversation: event.conversation,
      },
    );

    // Also broadcast to the company room so that sidebars of other users update
    this.chatGateway.broadcastToCompany(
      event.companyId,
      'conversation_updated',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        conversation: event.conversation,
      },
    );
  }

  @OnEvent(ChatEventNames.CONVERSATION_ARCHIVED)
  handleConversationArchived(event: ConversationArchivedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'conversation_archived',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        archivedBy: event.archivedBy,
      },
    );
  }

  @OnEvent(ChatEventNames.CONVERSATION_LOCKED)
  handleConversationLocked(event: ConversationLockedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'conversation_locked',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        isLocked: event.isLocked,
        lockedBy: event.lockedBy,
      },
    );
  }

  @OnEvent(ChatEventNames.CONVERSATION_FROZEN)
  handleConversationFrozen(event: ConversationFrozenEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'conversation_frozen',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        isFrozen: event.isFrozen,
        frozenBy: event.frozenBy,
      },
    );
  }

  // --------------------------------------------------------------------------
  // MEMBER DOMAIN EVENT HANDLERS
  // --------------------------------------------------------------------------

  @OnEvent(ChatEventNames.MEMBER_ADDED)
  handleMemberAdded(event: MemberAddedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'member_added',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        member: event.member,
      },
    );

    // Also notify the user who was added in their private user room
    if (event.member?.userId) {
      this.chatGateway.broadcastToUser(
        event.member.userId,
        'member_added',
        {
          eventId: event.eventId,
          conversationId: event.conversationId,
          member: event.member,
        },
      );
    }
  }

  @OnEvent(ChatEventNames.MEMBER_REMOVED)
  handleMemberRemoved(event: MemberRemovedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'member_removed',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        userId: event.userId,
      },
    );

    // Also notify the user who was removed in their private user room
    if (event.userId) {
      this.chatGateway.broadcastToUser(
        event.userId,
        'member_removed',
        {
          eventId: event.eventId,
          conversationId: event.conversationId,
          userId: event.userId,
        },
      );
    }
  }

  @OnEvent(ChatEventNames.MEMBER_ROLE_UPDATED)
  handleMemberRoleUpdated(event: MemberRoleUpdatedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'member_role_updated',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        userId: event.userId,
        role: event.role,
      },
    );
  }

  @OnEvent(ChatEventNames.MEMBER_MUTED)
  handleMemberMuted(event: MemberMutedEvent) {
    this.chatGateway.broadcastToConversation(
      event.conversationId,
      'member_muted',
      {
        eventId: event.eventId,
        conversationId: event.conversationId,
        userId: event.userId,
        isMuted: event.isMuted,
        mutedUntil: event.mutedUntil,
      },
    );
  }
}
