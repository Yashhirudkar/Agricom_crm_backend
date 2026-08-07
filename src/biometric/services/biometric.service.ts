import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricDevice } from '../models/biometric-device.model';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { BiometricDeviceService } from './biometric-device.service';
import { BiometricMappingService } from './biometric-mapping.service';
import { BiometricMetricsService } from './biometric-metrics.service';
import { BiometricLogService } from './biometric-log.service';
import { BiometricRetryService } from './biometric-retry.service';

import { BiometricSyncService } from './biometric-sync.service';

@Injectable()
export class BiometricService {
  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    private readonly deviceService: BiometricDeviceService,
    private readonly mappingService: BiometricMappingService,
    private readonly metricsService: BiometricMetricsService,
    private readonly logService: BiometricLogService,
    private readonly retryService: BiometricRetryService,
    private readonly syncService: BiometricSyncService,
  ) {}

  // ─── DEVICE SERVICE METHODS ───────────────────────────────────────

  async createDevice(companyId: number, data: any) {
    return this.deviceService.createDevice(companyId, data);
  }

  async getDevices(companyId: number) {
    return this.deviceService.getDevices(companyId);
  }

  async getDeviceById(companyId: number, id: number) {
    return this.deviceService.getDeviceById(companyId, id);
  }

  async updateDevice(companyId: number, id: number, data: any) {
    return this.deviceService.updateDevice(companyId, id, data);
  }

  async deleteDevice(companyId: number, id: number, userId?: number) {
    return this.deviceService.deleteDevice(companyId, id, userId);
  }

  async pingDevice(device: BiometricDevice, ipAddress?: string) {
    return this.deviceService.pingDevice(device, ipAddress);
  }

  async regenerateSecretKey(companyId: number, id: number) {
    return this.deviceService.regenerateSecretKey(companyId, id);
  }

  async syncDevice(companyId: number, id: number) {
    return this.syncService.syncDevice(companyId, id);
  }

  // ─── MAPPING SERVICE METHODS ──────────────────────────────────────

  async getUnknownUsers(companyId: number) {
    return this.mappingService.getUnknownUsers(companyId);
  }

  async mapBiometricUser(companyId: number, biometricUserId: string, employeeId: number) {
    return this.mappingService.mapBiometricUser(companyId, biometricUserId, employeeId);
  }

  async mapBulkBiometricUsers(companyId: number, mappings: Array<{ biometricUserId: string; employeeId: number }>) {
    return this.mappingService.mapBulkBiometricUsers(companyId, mappings);
  }

  // ─── LOGS SERVICE METHODS ─────────────────────────────────────────

  async getPunchLogs(companyId: number, filters: any) {
    return this.logService.getPunchLogs(companyId, filters);
  }

  // ─── RETRY SERVICE METHODS ────────────────────────────────────────

  async retryFailedPunch(companyId: number, id: number) {
    return this.retryService.retryFailedPunch(companyId, id);
  }

  async retryAllFailedPunches(companyId: number) {
    return this.retryService.retryAllFailedPunches(companyId);
  }

  // ─── METRICS SERVICE METHODS ──────────────────────────────────────

  async getSystemMetrics(companyId: number) {
    return this.metricsService.getSystemMetrics(companyId);
  }

  // ─── RAW PUNCH INGESTION (Thin write-heavy handler kept in facade) ────
  async ingestPunches(
    device: BiometricDevice,
    punches: Array<{
      deviceLogId: string;
      biometricUserId: string;
      timestamp: Date | string;
      punchType?: string;
      rawPayload?: any;
    }>,
    correlationId?: string,
  ): Promise<{ received: number; accepted: number }> {
    const defaultCorrelationId = correlationId || `CORR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const rawLogs = punches.map((p) => ({
      companyId: device.companyId,
      deviceSerialNumber: device.serialNumber,
      deviceLogId: p.deviceLogId,
      biometricUserId: p.biometricUserId,
      timestamp: new Date(p.timestamp),
      serverReceivedTime: new Date(),
      punchType: p.punchType || 'GENERIC',
      status: BiometricPunchStatus.PENDING,
      priority: 'NORMAL',
      correlationId: defaultCorrelationId,
      rawPayload: p.rawPayload || p,
    }));

    // Ingest into database using Sequelize's bulkCreate with ignoreDuplicates
    const result = await this.punchLogModel.bulkCreate(rawLogs, {
      ignoreDuplicates: true,
    });

    // Count how many records were inserted (auto-increment ID is non-null for successfully inserted entries)
    const acceptedCount = result.filter((r) => r.id).length;

    return {
      received: punches.length,
      accepted: acceptedCount,
    };
  }
}
