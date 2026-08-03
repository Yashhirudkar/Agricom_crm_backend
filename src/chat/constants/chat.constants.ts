export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
  CHANNEL = 'CHANNEL',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  DEPARTMENT = 'DEPARTMENT',
  SYSTEM = 'SYSTEM',
  BOT = 'BOT',
  RECORD = 'RECORD',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  VOICE = 'VOICE',
  FILE = 'FILE',
  LOCATION = 'LOCATION',
  CONTACT = 'CONTACT',
  POLL = 'POLL',
  SYSTEM = 'SYSTEM',
  AI = 'AI',
  CALL = 'CALL',
}

export enum PresenceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  AWAY = 'AWAY',
  BUSY = 'BUSY',
  IN_MEETING = 'IN_MEETING',
  DO_NOT_DISTURB = 'DO_NOT_DISTURB',
}

export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
  GUEST = 'GUEST',
}

export const CHAT_PERMISSIONS = {
  READ: 'chat:read',
  CREATE: 'chat:create',
  UPDATE: 'chat:update',
  DELETE: 'chat:delete',
  REACT: 'chat:react',
  MENTION: 'chat:mention',
  FILE_UPLOAD: 'chat:file-upload',
  MODERATE: 'chat:moderate',
  VIEW_ALL: 'chat:view-all',
};

export const SocketEvents = {
  // Client -> Server
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  MARK_READ: 'mark_read',
  PRESENCE_UPDATE: 'presence_update',

  // Server -> Client
  MESSAGE_CREATED: 'message_created',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_REACTED: 'message_reacted',
  TYPING: 'typing',
  PRESENCE_CHANGED: 'presence_changed',
};
