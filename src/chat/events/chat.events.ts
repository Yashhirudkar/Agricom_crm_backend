export enum ChatEventNames {
  MESSAGE_CREATED = 'chat.message.created.v1',
  MESSAGE_UPDATED = 'chat.message.updated.v1',
  MESSAGE_DELETED = 'chat.message.deleted.v1',
  MESSAGE_REACTED = 'chat.message.reacted.v1',
  MESSAGE_READ = 'chat.message.read.v1',
  MESSAGE_PINNED = 'chat.message.pinned.v1',
  MESSAGE_UNPINNED = 'chat.message.unpinned.v1',

  THREAD_REPLIED = 'chat.thread.replied.v1',

  POLL_CREATED = 'chat.poll.created.v1',
  POLL_VOTED = 'chat.poll.voted.v1',
  POLL_CLOSED = 'chat.poll.closed.v1',

  CONVERSATION_CREATED = 'chat.conversation.created.v1',
  CONVERSATION_UPDATED = 'chat.conversation.updated.v1',
  CONVERSATION_ARCHIVED = 'chat.conversation.archived.v1',
  CONVERSATION_LOCKED = 'chat.conversation.locked.v1',
  CONVERSATION_FROZEN = 'chat.conversation.frozen.v1',

  MEMBER_ADDED = 'chat.member.added.v1',
  MEMBER_REMOVED = 'chat.member.removed.v1',
  MEMBER_ROLE_UPDATED = 'chat.member.role_updated.v1',
  MEMBER_MUTED = 'chat.member.muted.v1',

  PRESENCE_UPDATED = 'chat.presence.updated.v1',
}

export abstract class BaseChatEvent {
  readonly eventId: string;
  readonly eventVersion: number = 1;
  readonly timestamp: string;

  constructor() {
    this.eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = new Date().toISOString();
  }
}

// ----------------------------------------------------------------------------
// MESSAGE EVENTS
// ----------------------------------------------------------------------------

export class MessageCreatedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly message: any,
    public readonly clientMessageId?: string,
  ) {
    super();
  }
}

export class MessageUpdatedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly messageId: number,
    public readonly message: any,
  ) {
    super();
  }
}

export class MessageDeletedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly messageId: number,
    public readonly deletedBy: number,
    public readonly mode: 'everyone' | 'me',
  ) {
    super();
  }
}

export class MessageReactedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly messageId: number,
    public readonly userId: number,
    public readonly reaction: string,
    public readonly reactionRecord: any,
  ) {
    super();
  }
}

export class MessageReadEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly userId: number,
    public readonly lastMessageId: number,
  ) {
    super();
  }
}

export class MessagePinnedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly messageId: number,
    public readonly pinnedBy: number,
    public readonly isPinned: boolean,
  ) {
    super();
  }
}

// ----------------------------------------------------------------------------
// THREAD EVENTS
// ----------------------------------------------------------------------------

export class ThreadRepliedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly parentMessageId: number,
    public readonly companyId: number,
    public readonly replyMessage: any,
    public readonly threadSummary: any,
  ) {
    super();
  }
}

// ----------------------------------------------------------------------------
// POLL EVENTS
// ----------------------------------------------------------------------------

export class PollCreatedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly poll: any,
  ) {
    super();
  }
}

export class PollVotedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly pollId: number,
    public readonly userId: number,
    public readonly pollResults: any,
  ) {
    super();
  }
}

export class PollClosedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly pollId: number,
    public readonly closedBy: number,
    public readonly finalResults: any,
  ) {
    super();
  }
}

// ----------------------------------------------------------------------------
// CONVERSATION EVENTS
// ----------------------------------------------------------------------------

export class ConversationCreatedEvent extends BaseChatEvent {
  constructor(
    public readonly companyId: number,
    public readonly conversation: any,
  ) {
    super();
  }
}

export class ConversationUpdatedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly conversation: any,
  ) {
    super();
  }
}

export class ConversationArchivedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly archivedBy: number,
  ) {
    super();
  }
}

export class ConversationLockedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly isLocked: boolean,
    public readonly lockedBy: number,
  ) {
    super();
  }
}

export class ConversationFrozenEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly isFrozen: boolean,
    public readonly frozenBy: number,
  ) {
    super();
  }
}

// ----------------------------------------------------------------------------
// MEMBER EVENTS
// ----------------------------------------------------------------------------

export class MemberAddedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly member: any,
  ) {
    super();
  }
}

export class MemberRemovedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly userId: number,
  ) {
    super();
  }
}

export class MemberRoleUpdatedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly userId: number,
    public readonly role: string,
  ) {
    super();
  }
}

export class MemberMutedEvent extends BaseChatEvent {
  constructor(
    public readonly conversationId: number,
    public readonly companyId: number,
    public readonly userId: number,
    public readonly isMuted: boolean,
    public readonly mutedUntil: Date | null,
  ) {
    super();
  }
}
