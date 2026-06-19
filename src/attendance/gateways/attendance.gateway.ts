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
import { InjectModel } from '@nestjs/sequelize';
import { Employee } from '../../hrms/models/employee.model';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
})
export class AttendanceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AttendanceGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
  ) {}

  /**
   * Serializes database records to keep payloads clean and whitelisted.
   */
  private serializePayload(record: any, action: string) {
    return {
      id: record.id,
      employeeId: record.employeeId,
      companyId: record.companyId,
      action,
      attendanceState: record.attendanceState,
      attendanceStatus: record.attendanceStatus,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      date: record.date,
      totalHours: record.totalHours,
      overtimeHours: record.overtimeHours,
      timestamp: new Date(),
      employee: record.employee ? (record.employee.toJSON ? record.employee.toJSON() : record.employee) : undefined,
    };
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      const companyIdStr = client.handshake.auth?.companyId || client.handshake.query?.companyId;

      if (!token) {
        client.disconnect(true);
        return;
      }

      // 1. Verify JWT
      let payload: any;
      try {
        payload = this.jwtService.verify(token);
      } catch (jwtErr) {
        client.disconnect(true);
        return;
      }

      if (!payload || !payload.userId) {
        this.logger.warn('Socket connection rejected: Invalid token payload.');
        client.disconnect(true);
        return;
      }

      // 2. Lookup employee associated with the active company workspace
      if (companyIdStr) {
        const companyId = parseInt(companyIdStr, 10);
        const employee = await this.employeeModel.findOne({
          where: { userId: payload.userId, companyId },
        });

        if (employee) {
          // Join rooms statelessly
          client.join(`employee-${employee.id}`);
          client.join(`company-${companyId}`);
          
          (client as any).employeeId = employee.id;
          (client as any).companyId = companyId;
          this.logger.log(`Socket authenticated: Employee ${employee.id} joined rooms for Company ${companyId}`);
        } else {
          this.logger.warn(`Socket connection rejected: User ${payload.userId} is not an employee in company ${companyId}`);
          client.disconnect(true);
          return;
        }
      } else {
        this.logger.log(`Socket authenticated user ${payload.userId} (waiting for company selection)`);
      }
    } catch (err) {
      this.logger.error(`Socket connection auth error: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_rooms')
  async handleJoinRooms(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token?: string; companyId: number },
  ) {
    try {
      const token = data.token || client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        return { error: 'No authentication token provided.' };
      }

      const payload = this.jwtService.verify(token);
      if (!payload || !payload.userId) {
        return { error: 'Invalid token payload.' };
      }

      const companyId = parseInt(data.companyId as any, 10);
      const employee = await this.employeeModel.findOne({
        where: { userId: payload.userId, companyId },
      });

      if (!employee) {
        return { error: 'Not authorized for this company workspace.' };
      }

      // Join rooms statelessly
      client.join(`employee-${employee.id}`);
      client.join(`company-${companyId}`);
      
      (client as any).employeeId = employee.id;
      (client as any).companyId = companyId;

      this.logger.log(`Socket client joined rooms: employee-${employee.id}, company-${companyId}`);
      return { status: 'joined', employeeId: employee.id, companyId };
    } catch (err) {
      return { error: `Authentication failed: ${err.message}` };
    }
  }

  emitCheckedIn(record: any) {
    const payload = this.serializePayload(record, 'checked_in');
    this.server.to(`company-${record.companyId}`).emit('attendance-checkin', payload);
    this.server.to(`employee-${record.employeeId}`).emit('attendance-checkin', payload);
  }

  emitCheckedOut(record: any) {
    const payload = this.serializePayload(record, 'checked_out');
    this.server.to(`company-${record.companyId}`).emit('attendance-checkout', payload);
    this.server.to(`employee-${record.employeeId}`).emit('attendance-checkout', payload);
  }

  emitAttendanceUpdate(action: string, record: any) {
    console.log("socket emit event name", 'attendance-update');
    console.log("payload data", record);
    const payload = this.serializePayload(record, action);
    console.log("serialized payload", payload);
    this.server.to(`company-${record.companyId}`).emit('attendance-update', payload);
    this.server.to(`employee-${record.employeeId}`).emit('attendance-update', payload);
  }

  emitBatchUpdate(records: any[], companyId: number) {
    const serializedRecords = records.map(record => this.serializePayload(record, 'batch_update'));
    this.server.to(`company-${companyId}`).emit('attendance-batch-update', serializedRecords);
  }
}
