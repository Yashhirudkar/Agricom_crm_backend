import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (requestOrigin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.query?.token;

      if (!token) {
        this.logger.warn(`[NotificationsGateway] Connection rejected: No token found. Client ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (jwtErr) {
        this.logger.warn(`[NotificationsGateway] Connection rejected: Token verification failed. Client ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      if (!payload || !payload.userId) {
        this.logger.warn(`[NotificationsGateway] Connection rejected: Invalid payload or userId missing. Client ID: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const userId = payload.userId;
      client.join(`user-${userId}`);
      this.logger.log(`[NotificationsGateway] Socket authenticated: User ${userId} joined room user-${userId}`);
    } catch (err) {
      this.logger.error(`[NotificationsGateway] Socket connection auth error: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[NotificationsGateway] Socket client disconnected: ${client.id}`);
  }

  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user-${userId}`).emit(event, data);
    this.logger.log(`[NotificationsGateway] Emitted event '${event}' to room user-${userId}`);
  }
}
