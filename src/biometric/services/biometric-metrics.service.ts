import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { BiometricDevice } from '../models/biometric-device.model';
import { Op } from 'sequelize';

@Injectable()
export class BiometricMetricsService {
  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
  ) {}

  async getSystemMetrics(companyId: number): Promise<any> {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    // 1. Devices health and real-time offline status delay
    const devices = await this.deviceModel.findAll({
      where: { companyId, deletedAt: null },
    });

    const devicesHealth = devices.map((d) => {
      const delaySeconds = d.lastHeartbeat
        ? Math.max(0, Math.round((now - new Date(d.lastHeartbeat).getTime()) / 1000))
        : null;

      return {
        id: d.id,
        name: d.name,
        serialNumber: d.serialNumber,
        status: d.status,
        maintenanceMode: d.maintenanceMode,
        heartbeatDelaySeconds: delaySeconds,
        configVersion: d.configVersion,
      };
    });

    const totalDevices = devices.length;
    const onlineDevices = devices.filter((d) => d.status === 'ONLINE').length;
    const maintenanceDevices = devices.filter((d) => d.maintenanceMode).length;

    // 2. Queue metrics
    const stats = await this.punchLogModel.findAll({
      attributes: [
        'status',
        [this.punchLogModel.sequelize.fn('COUNT', this.punchLogModel.sequelize.col('id')), 'count'],
      ],
      where: { companyId },
      group: ['status'],
    });

    const statusCounts = { PENDING: 0, SUCCESS: 0, FAILED: 0, UNKNOWN_USER: 0, PROCESSING: 0 };
    stats.forEach((stat: any) => {
      const status = stat.getDataValue('status');
      const count = parseInt(stat.getDataValue('count'), 10);
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts] = count;
      }
    });

    const totalLogs = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    // Calculate rates and oldest pending punch delay
    const currentQueueSize = statusCounts.PENDING + statusCounts.PROCESSING;
    
    const oldestPending = await this.punchLogModel.findOne({
      where: { companyId, status: [BiometricPunchStatus.PENDING, BiometricPunchStatus.PROCESSING] },
      order: [['serverReceivedTime', 'ASC']],
    });

    const oldestPendingDelaySeconds = oldestPending && oldestPending.serverReceivedTime
      ? Math.max(0, Math.round((now - new Date(oldestPending.serverReceivedTime).getTime()) / 1000))
      : 0;

    // Ingestion delays (Latency delay in processing successful punches)
    const delayStats = await this.punchLogModel.findAll({
      attributes: [
        [
          this.punchLogModel.sequelize.fn(
            'AVG',
            this.punchLogModel.sequelize.literal('EXTRACT(EPOCH FROM ("processedTime" - "serverReceivedTime")) * 1000'),
          ),
          'avgProcessingMs',
        ],
      ],
      where: {
        companyId,
        status: BiometricPunchStatus.SUCCESS,
        processedTime: { [Op.ne]: null },
      },
      raw: true,
    });

    const averageQueueDelayMs = delayStats[0] ? Math.round(parseFloat((delayStats[0] as any).avgProcessingMs || 0)) : 0;

    // Processing rate per second (successful punches in last 1 hour)
    const successLastHour = await this.punchLogModel.count({
      where: {
        companyId,
        status: BiometricPunchStatus.SUCCESS,
        processedTime: { [Op.gte]: oneHourAgo },
      },
    });
    const processingRatePerSecond = parseFloat((successLastHour / 3600).toFixed(4));

    // Percentages
    const failedPercentage = totalLogs > 0 ? parseFloat(((statusCounts.FAILED / totalLogs) * 100).toFixed(2)) : 0;
    const unknownPercentage = totalLogs > 0 ? parseFloat(((statusCounts.UNKNOWN_USER / totalLogs) * 100).toFixed(2)) : 0;
    const successRate = totalLogs > 0 ? parseFloat(((statusCounts.SUCCESS / totalLogs) * 100).toFixed(2)) : 100;

    return {
      devices: {
        total: totalDevices,
        online: onlineDevices,
        offline: totalDevices - onlineDevices,
        inMaintenance: maintenanceDevices,
        details: devicesHealth,
      },
      queue: {
        currentQueueSize,
        oldestPendingPunchDelaySeconds: oldestPendingDelaySeconds,
        averageQueueDelayMs,
        processingRatePerSecond,
        totalLogs,
        statusBreakdown: statusCounts,
        successRate,
        failedPercentage,
        unknownPercentage,
      },
    };
  }
}
