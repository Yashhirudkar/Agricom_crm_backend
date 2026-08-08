import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { PresenceStatus, MessageType } from '../constants/chat.constants';
import { MessageService } from '../services/message.service';
import { ConversationService } from '../services/conversation.service';
import { PolicyService } from '../services/policy.service';
import { SendMessageDto, ReactMessageDto } from '../dto/chat.dto';

@WebSocketGateway({
  cors: {
    origin: (requestOrigin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private debounceCleanupTimer: NodeJS.Timeout | null = null;

  // In-memory mappings to support reconnect and multiple browser tabs
  private readonly userIdToSockets = new Map<number, Set<string>>();
  private readonly socketIdToUser = new Map<string, number>();
  private readonly presenceStates = new Map<number, PresenceStatus>();

  // Resilience: Typing Timers (Key: `${conversationId}:${userId}`)
  private readonly typingTimers = new Map<string, NodeJS.Timeout>();

  // Resilience: Reaction Debounce (Key: `${userId}:${messageId}`, Value: timestamp)
  private readonly reactionDebounceMap = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => MessageService))
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversationService: ConversationService,
    private readonly policyService: PolicyService,
  ) {
    // Periodic cleanup of reaction debounce map every 2 minutes
    this.debounceCleanupTimer = setInterval(() => this.cleanupDebounceMap(), 2 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.debounceCleanupTimer) {
      clearInterval(this.debounceCleanupTimer);
      this.debounceCleanupTimer = null;
    }
    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();
  }

  private cleanupDebounceMap() {
    const now = Date.now();
    for (const [key, timestamp] of this.reactionDebounceMap.entries()) {
      if (now - timestamp > 5000) {
        this.reactionDebounceMap.delete(key);
      }
    }
  }

  // --------------------------------------------------------------------------
  // BROADCAST API (Invoked by ChatEventsListener)
  // --------------------------------------------------------------------------

  broadcastToConversation(conversationId: number, event: string, payload: any) {
    if (this.server) {
      this.server.to(`conversation-${conversationId}`).emit(event, payload);
    }
  }

  broadcastToCompany(companyId: number, event: string, payload: any) {
    if (this.server) {
      this.server.to(`company-${companyId}`).emit(event, payload);
    }
  }

  broadcastToUser(userId: number, event: string, payload: any) {
    if (this.server) {
      this.server.to(`user-${userId}`).emit(event, payload);
    }
  }

  // --------------------------------------------------------------------------
  // CONNECTION LIFECYCLE
  // --------------------------------------------------------------------------

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.query?.token;
      const companyIdStr =
        client.handshake.auth?.companyId || client.handshake.query?.companyId;

      if (!token) {
        this.logger.warn(`Connection rejected: Token not found. Socket ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (jwtErr) {
        this.logger.warn(`Connection rejected: JWT Verification failed. Socket ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      if (!payload || !payload.userId) {
        this.logger.warn(`Connection rejected: Invalid payload. Socket ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const userId = payload.userId;
      const companyId = companyIdStr ? parseInt(companyIdStr, 10) : null;
      const isSuperAdmin = payload.type === 'super_admin';

      // Attach context to socket metadata
      (client as any).userId = userId;
      (client as any).clientId = payload.clientId || null;
      (client as any).companyId = companyId;
      (client as any).isSuperAdmin = isSuperAdmin;

      // Track active sockets
      if (!this.userIdToSockets.has(userId)) {
        this.userIdToSockets.set(userId, new Set());
      }
      this.userIdToSockets.get(userId).add(client.id);
      this.socketIdToUser.set(client.id, userId);

      // Join private user room and active company workspace room
      client.join(`user-${userId}`);
      if (companyId) {
        client.join(`company-${companyId}`);
      }

      // Update Presence
      this.presenceStates.set(userId, PresenceStatus.ONLINE);
      if (companyId) {
        this.broadcastToCompany(companyId, 'presence_changed', {
          userId,
          status: PresenceStatus.ONLINE,
          lastSeen: null,
        });
      }

      client.emit('connection_ready', {
        userId,
        status: PresenceStatus.ONLINE,
        companyId,
      });
    } catch (err) {
      this.logger.error(`Handshake connection validation error: ${err.message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketIdToUser.get(client.id);
    if (!userId) return;

    this.socketIdToUser.delete(client.id);
    const sockets = this.userIdToSockets.get(userId);

    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userIdToSockets.delete(userId);
        this.presenceStates.set(userId, PresenceStatus.OFFLINE);
        const lastSeen = new Date();

        const companyId = (client as any).companyId;
        if (companyId) {
          this.broadcastToCompany(companyId, 'presence_changed', {
            userId,
            status: PresenceStatus.OFFLINE,
            lastSeen,
          });
        }

        // Cleanup all typing timers for this user
        this.cleanupUserTyping(userId);
      }
    }
  }

  private cleanupUserTyping(userId: number) {
    for (const [key, timer] of this.typingTimers.entries()) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeout(timer);
        this.typingTimers.delete(key);
        const conversationId = parseInt(key.split(':')[0], 10);
        this.broadcastToConversation(conversationId, 'typing', {
          conversationId,
          userId,
          isTyping: false,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // ROOM SUBSCRIPTION
  // --------------------------------------------------------------------------

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;

    if (!userId) {
      return { status: 'FAILED', error: 'Unauthenticated socket session.' };
    }

    if (!data.conversationId) {
      return { status: 'FAILED', error: 'conversationId parameter is required.' };
    }

    try {
      const isAllowed = await this.policyService.canJoinSocket(
        data.conversationId,
        userId,
        companyId,
        isSuperAdmin,
      );
      if (!isAllowed) {
        return { status: 'FAILED', error: 'You do not have access to this conversation.' };
      }

      client.join(`conversation-${data.conversationId}`);
      return { status: 'SUCCESS', conversationId: data.conversationId };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = (client as any).userId;
    if (!userId || !data.conversationId) {
      return { status: 'FAILED', error: 'Invalid parameters.' };
    }

    client.leave(`conversation-${data.conversationId}`);
    return { status: 'SUCCESS', conversationId: data.conversationId };
  }

  @SubscribeMessage('get_presence')
  handleGetPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userIds: number[] },
  ) {
    if (!data?.userIds?.length) return { status: 'FAILED', error: 'userIds required.' };

    const result: Record<number, { status: string; lastSeen: string | null }> = {};
    for (const uid of data.userIds) {
      const presenceStatus = this.presenceStates.get(uid);
      result[uid] = {
        status: presenceStatus ?? PresenceStatus.OFFLINE,
        lastSeen: presenceStatus === PresenceStatus.ONLINE ? null : new Date().toISOString(),
      };
    }

    return { status: 'SUCCESS', data: result };
  }

  @SubscribeMessage('presence_update')
  handlePresenceUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { status: PresenceStatus },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;

    if (!userId || !data.status || !Object.values(PresenceStatus).includes(data.status)) {
      return { status: 'FAILED', error: 'Invalid status parameter.' };
    }

    this.presenceStates.set(userId, data.status);

    if (companyId) {
      this.broadcastToCompany(companyId, 'presence_changed', {
        userId,
        status: data.status,
        lastSeen: data.status === PresenceStatus.OFFLINE ? new Date() : null,
      });
    }

    return { status: 'SUCCESS', statusValue: data.status };
  }

  // --------------------------------------------------------------------------
  // REALTIME MESSAGING DELEGATION (Services handle persistence & emit domain events)
  // --------------------------------------------------------------------------

  @SubscribeMessage('message_send')
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      clientMessageId?: string;
      content?: string;
      type: MessageType;
      parentId?: number;
      attachmentId?: number;
      payload?: any;
    },
  ) {
    const userId = (client as any).userId;
    const clientId = (client as any).clientId;
    const companyId = (client as any).companyId;

    if (!userId) {
      return {
        status: 'FAILED',
        clientMessageId: data.clientMessageId,
        error: 'Unauthenticated socket session.',
      };
    }

    if (!data.conversationId) {
      return {
        status: 'FAILED',
        clientMessageId: data.clientMessageId,
        error: 'conversationId is required.',
      };
    }

    try {
      const dto: SendMessageDto = {
        content: data.content,
        type: data.type || MessageType.TEXT,
        parentId: data.parentId,
        attachmentId: data.attachmentId,
        payload: data.payload,
      };

      // Service persists in DB transaction, commits, and emits domain event to ChatEventsListener
      const message = await this.messageService.send(
        data.conversationId,
        companyId,
        dto,
        {
          userId,
          clientId,
          ipAddress: client.handshake.address,
          userAgent: client.handshake.headers['user-agent'],
        },
        data.clientMessageId,
      );

      // Return immediate structured ACK to sender
      return {
        status: 'SUCCESS',
        clientMessageId: data.clientMessageId,
        data: message,
      };
    } catch (err) {
      this.logger.error(`Error sending message via WS: ${err.message}`);
      return {
        status: 'FAILED',
        clientMessageId: data.clientMessageId,
        error: err.message,
      };
    }
  }

  @SubscribeMessage('message_edit')
  async handleMessageEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      messageId: number;
      content: string;
    },
  ) {
    const userId = (client as any).userId;
    const clientId = (client as any).clientId;
    const companyId = (client as any).companyId;

    if (!userId) {
      return { status: 'FAILED', error: 'Unauthenticated socket session.' };
    }

    try {
      const message = await this.messageService.edit(
        data.conversationId,
        data.messageId,
        data.content,
        companyId,
        {
          userId,
          clientId,
          ipAddress: client.handshake.address,
          userAgent: client.handshake.headers['user-agent'],
        },
      );

      return { status: 'SUCCESS', data: message };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }

  @SubscribeMessage('message_delete')
  async handleMessageDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      messageId: number;
      mode: 'everyone' | 'me';
    },
  ) {
    const userId = (client as any).userId;
    const clientId = (client as any).clientId;
    const companyId = (client as any).companyId;

    if (!userId) {
      return { status: 'FAILED', error: 'Unauthenticated socket session.' };
    }

    try {
      await this.messageService.delete(
        data.conversationId,
        data.messageId,
        data.mode,
        companyId,
        {
          userId,
          clientId,
          ipAddress: client.handshake.address,
          userAgent: client.handshake.headers['user-agent'],
        },
      );

      return {
        status: 'SUCCESS',
        conversationId: data.conversationId,
        messageId: data.messageId,
        mode: data.mode,
      };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }

  @SubscribeMessage('message_react')
  async handleMessageReact(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      messageId: number;
      reaction: string;
    },
  ) {
    const userId = (client as any).userId;
    const clientId = (client as any).clientId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;

    if (!userId) {
      return { status: 'FAILED', error: 'Unauthenticated socket session.' };
    }

    const isAllowed = await this.policyService.canJoinSocket(data.conversationId, userId, companyId, isSuperAdmin);
    if (!isAllowed) {
      return { status: 'FAILED', error: 'Access denied to this conversation.' };
    }

    const debounceKey = `${userId}:${data.messageId}`;
    const lastTime = this.reactionDebounceMap.get(debounceKey) || 0;
    const now = Date.now();
    if (now - lastTime < 300) {
      return { status: 'FAILED', error: 'Rate limit: Too many reactions.' };
    }
    this.reactionDebounceMap.set(debounceKey, now);

    try {
      const reactionRecord = await this.messageService.react(
        data.conversationId,
        data.messageId,
        { reaction: data.reaction },
        companyId,
        { userId, clientId },
      );

      return { status: 'SUCCESS', data: reactionRecord };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }

  @SubscribeMessage('message_read')
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: number;
      lastMessageId: number;
    },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;

    if (!userId) {
      return { status: 'FAILED', error: 'Unauthenticated socket session.' };
    }

    const isAllowed = await this.policyService.canJoinSocket(data.conversationId, userId, companyId, isSuperAdmin);
    if (!isAllowed) {
      return { status: 'FAILED', error: 'Access denied to this conversation.' };
    }

    try {
      await this.messageService.markRead(
        data.conversationId,
        data.lastMessageId,
        userId,
      );

      return {
        status: 'SUCCESS',
        conversationId: data.conversationId,
        lastMessageId: data.lastMessageId,
      };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // TYPING WITH 4-SECOND AUTO-TIMEOUT & CLEANUP
  // --------------------------------------------------------------------------

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;
    if (!userId || !data.conversationId) return;

    const isAllowed = await this.policyService.canJoinSocket(data.conversationId, userId, companyId, isSuperAdmin);
    if (!isAllowed) return;

    // Check typing visibility
    const conversation = await this.conversationService.getConversationById(data.conversationId, companyId);
    if (conversation && conversation.typingVisibility === 'NOBODY') {
      return;
    }

    const timerKey = `${data.conversationId}:${userId}`;

    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.typingTimers.delete(timerKey);
      client.to(`conversation-${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId,
        isTyping: false,
      });
    }, 4000);

    this.typingTimers.set(timerKey, timeout);

    client.to(`conversation-${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;
    if (!userId || !data.conversationId) return;

    const isAllowed = await this.policyService.canJoinSocket(data.conversationId, userId, companyId, isSuperAdmin);
    if (!isAllowed) return;

    const timerKey = `${data.conversationId}:${userId}`;
    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }

    client.to(`conversation-${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
      isTyping: false,
    });
  }

  // --------------------------------------------------------------------------
  // OFFLINE RECONNECTION SYNC
  // --------------------------------------------------------------------------

  @SubscribeMessage('sync_messages')
  async handleSyncMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; lastReceivedMessageId: number },
  ) {
    const userId = (client as any).userId;
    const companyId = (client as any).companyId;
    const isSuperAdmin = (client as any).isSuperAdmin || false;
    if (!userId || !data.conversationId) {
      return { status: 'FAILED', error: 'Invalid parameters.' };
    }

    const isAllowed = await this.policyService.canJoinSocket(data.conversationId, userId, companyId, isSuperAdmin);
    if (!isAllowed) {
      return { status: 'FAILED', error: 'Access denied to this conversation.' };
    }

    try {
      const missed = await this.messageService.getMissedMessages(
        data.conversationId,
        data.lastReceivedMessageId || 0,
        userId,
      );

      return {
        status: 'SUCCESS',
        conversationId: data.conversationId,
        messages: missed,
      };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }
}
