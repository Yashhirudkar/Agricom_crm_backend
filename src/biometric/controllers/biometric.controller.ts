import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BiometricService } from '../services/biometric.service';
import { BiometricHealthPollerService } from '../services/biometric-health-poller.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { BiometricHmacGuard } from '../guards/biometric-hmac.guard';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';

@Controller('biometric')
export class BiometricController {
  constructor(
    private readonly biometricService: BiometricService,
    private readonly healthPoller: BiometricHealthPollerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getUserId(req: any): number | null {
    return req.user?.id || null;
  }

  // ─── ADMIN DEVICE MANAGEMENT ENDPOINTS ─────────────────────────────

  @Post('devices')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'BiometricDevice', action: 'CREATE' })
  async registerDevice(
    @Request() req,
    @Body() data: {
      name: string;
      ipAddress: string;
      port?: number;
      serialNumber: string;
      branchId?: number;
      timeOffset?: number;
    },
  ) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.createDevice(companyId, data);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:read')
  async listDevices(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.getDevices(companyId);
  }

  @Get('devices/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:read')
  async getDeviceDetails(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.getDeviceById(companyId, id);
  }

  @Put('devices/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'BiometricDevice', action: 'UPDATE' })
  async updateDevice(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: {
      name?: string;
      ipAddress?: string;
      port?: number;
      branchId?: number;
      timeOffset?: number;
      isActive?: boolean;
      maintenanceMode?: boolean;
    },
  ) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.updateDevice(companyId, id, data);
  }

  @Delete('devices/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'BiometricDevice', action: 'DELETE' })
  async removeDevice(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    await this.biometricService.deleteDevice(companyId, id, userId);
    return { success: true, message: 'Device soft-deleted successfully' };
  }

  @Post('devices/:id/regenerate-key')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'BiometricDevice', action: 'UPDATE' })
  async regenerateSecretKey(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    const device = await this.biometricService.regenerateSecretKey(companyId, id);
    return {
      success: true,
      message: 'HMAC secret key regenerated successfully. configVersion bumped.',
      secretKey: device.secretKey,
      configVersion: device.configVersion,
    };
  }

  // ─── DEVICE LAN CLIENT HEARTBEAT ENDPOINT ──────────────────────────

  @Post('devices/ping')
  @UseGuards(BiometricHmacGuard)
  @HttpCode(HttpStatus.OK)
  async deviceHeartbeat(@Request() req) {
    const device = req.device;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const updatedDevice = await this.biometricService.pingDevice(device, ipAddress);

    this.eventEmitter.emit('device.v1.heartbeat', {
      deviceId: updatedDevice.id,
      serialNumber: updatedDevice.serialNumber,
      status: updatedDevice.status,
    });

    return {
      status: updatedDevice.status,
      timeOffset: updatedDevice.timeOffset,
      configVersion: updatedDevice.configVersion,
      serverTime: new Date(),
    };
  }

  // ─── MANUAL DEVICE PROBE (Admin trigger) ───────────────────────────

  @Post('devices/:id/probe')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  async probeDevice(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    const device = await this.biometricService.getDeviceById(companyId, id);
    await this.healthPoller['probeDevice'](device);
    // Reload to get updated status from DB
    await device.reload();
    return {
      success: true,
      id: device.id,
      name: device.name,
      status: device.status,
      lastHeartbeat: device.lastHeartbeat,
    };
  }

  // ─── MANUAL DEVICE SYNC NOW (Admin trigger) ────────────────────────
  @Post('devices/:id/sync')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'BiometricDevice', action: 'UPDATE' })
  @HttpCode(HttpStatus.OK)
  async syncDevice(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.syncDevice(companyId, id);
  }

  @Post('punches')
  @UseGuards(BiometricHmacGuard)
  @HttpCode(HttpStatus.OK)
  async ingestRawPunches(
    @Request() req,
    @Body() body: {
      punches: Array<{
        deviceLogId: string;
        biometricUserId: string;
        timestamp: string;
        punchType?: string;
        rawPayload?: any;
      }>;
    },
  ) {
    const device = req.device;

    if (!body.punches || !Array.isArray(body.punches)) {
      throw new BadRequestException('Invalid punches payload format');
    }

    // Extract or generate correlation ID to trace logs through processing pipeline
    const correlationId =
      req.headers['x-correlation-id'] ||
      `CORR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const result = await this.biometricService.ingestPunches(device, body.punches, correlationId);

    // If new punches were written to the queue, emit versioned event to wake up processor
    if (result.accepted > 0) {
      this.eventEmitter.emit('biometric.v1.punch.received', {
        companyId: device.companyId,
        deviceSerialNumber: device.serialNumber,
        correlationId,
      });
    }

    return {
      success: true,
      correlationId,
      received: result.received,
      accepted: result.accepted,
      message: `${result.accepted} punches accepted into processing queue out of ${result.received} received.`,
    };
  }

  // ─── ADMIN PUNCH MANAGEMENT & LOGS ENDPOINTS ───────────────────────

  @Get('punches/unknown-users')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:read')
  async getUnknownBiometricUsers(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.getUnknownUsers(companyId);
  }

  @Post('punches/map-user')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'Employee', action: 'UPDATE' })
  async mapBiometricUser(
    @Request() req,
    @Body() body: { biometricUserId: string; employeeId: number },
  ) {
    const companyId = this.getCompanyId(req);
    if (!body.biometricUserId || !body.employeeId) {
      throw new BadRequestException('biometricUserId and employeeId are required');
    }
    return this.biometricService.mapBiometricUser(
      companyId,
      body.biometricUserId,
      body.employeeId,
    );
  }

  @Post('punches/map-user-bulk')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  @AuditLog({ entityType: 'Employee', action: 'UPDATE' })
  async mapBulkBiometricUsers(
    @Request() req,
    @Body() body: { mappings: Array<{ biometricUserId: string; employeeId: number }> },
  ) {
    const companyId = this.getCompanyId(req);
    if (!body.mappings || !Array.isArray(body.mappings)) {
      throw new BadRequestException('mappings array is required');
    }
    return this.biometricService.mapBulkBiometricUsers(companyId, body.mappings);
  }

  @Get('punches/logs')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:read')
  async queryPunchLogs(
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const { status, biometricUserId, limit, offset } = req.query;
    return this.biometricService.getPunchLogs(companyId, {
      status,
      biometricUserId,
      limit,
      offset,
    });
  }

  @Post('punches/:id/retry')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  async retryPunchProcessing(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = this.getCompanyId(req);
    const punch = await this.biometricService.retryFailedPunch(companyId, id);

    return {
      success: true,
      message: `Punch log ${id} reset to PENDING. Processing triggered.`,
      punch,
    };
  }

  @Post('punches/retry-all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:create')
  async retryAllFailedPunches(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.retryAllFailedPunches(companyId);
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('attendance_activity:read')
  async getBiometricMetrics(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.biometricService.getSystemMetrics(companyId);
  }
}
