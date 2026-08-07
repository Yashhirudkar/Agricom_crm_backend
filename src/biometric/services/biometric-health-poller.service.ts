import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Cron } from '@nestjs/schedule';
import { BiometricDevice, BiometricDeviceStatus } from '../models/biometric-device.model';
import * as net from 'net';

@Injectable()
export class BiometricHealthPollerService {
  private readonly logger = new Logger(BiometricHealthPollerService.name);
  public static isSyncing = false;

  constructor(
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
  ) {}

  // Probe all active devices every 60 seconds via direct TCP connect
  @Cron('0 * * * * *') // every minute
  async pollAllDevices(): Promise<void> {
    if (BiometricHealthPollerService.isSyncing) {
      this.logger.log(`Health Poller: Skipped probing (Device Manual Sync in Progress)`);
      return;
    }

    const devices = await this.deviceModel.findAll({
      where: { isActive: true, deletedAt: null },
    });

    if (devices.length === 0) return;

    // Filter out devices currently SYNCING to avoid socket collisions on port 4370
    const pollableDevices = devices.filter((d) => d.status !== BiometricDeviceStatus.SYNCING);
    if (pollableDevices.length === 0) return;

    this.logger.log(`Health Poller: Probing ${pollableDevices.length} biometric device(s)...`);

    await Promise.allSettled(pollableDevices.map((device) => this.probeDevice(device)));
  }

  private probeDevice(device: BiometricDevice): Promise<void> {
    return new Promise((resolve) => {
      const probePort = (device.port === 5005 || !device.port) ? 4370 : device.port;
      const socket = new net.Socket();
      const timeoutMs = 5000; // 5 seconds connection timeout

      const cleanup = () => {
        try { socket.destroy(); } catch (_) {}
      };

      socket.setTimeout(timeoutMs);

      socket.connect(probePort, device.ipAddress, async () => {
        // TCP connection succeeded — send clean CMD_EXIT packet to release session
        const exitPacket = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x08, 0x00, 0x00, 0x00, 0xe9, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        socket.write(exitPacket, () => {
          try { socket.end(); } catch (_) {}
        });
        try {
          const updates: any = { lastHeartbeat: new Date() };
          if (!device.maintenanceMode) {
            updates.status = BiometricDeviceStatus.ONLINE;
          }
          if (device.port !== probePort) {
            updates.port = probePort;
          }
          await device.update(updates);
          this.logger.log(
            `Health Poller: ✅ ${device.name} (${device.ipAddress}:${probePort}) is ONLINE`
          );
        } catch (err) {
          this.logger.error(`Health Poller: Failed to update status for device ${device.id}`, err);
        }
        resolve();
      });

      socket.on('timeout', async () => {
        cleanup();
        try {
          if (!device.maintenanceMode) {
            await device.update({ status: BiometricDeviceStatus.OFFLINE });
          }
          this.logger.warn(
            `Health Poller: ⚠️ ${device.name} (${device.ipAddress}:${device.port}) TCP timeout → OFFLINE`
          );
        } catch (_) {}
        resolve();
      });

      socket.on('error', async (err) => {
        cleanup();
        try {
          if (!device.maintenanceMode) {
            await device.update({ status: BiometricDeviceStatus.OFFLINE });
          }
          this.logger.warn(
            `Health Poller: ❌ ${device.name} (${device.ipAddress}:${device.port}) error: ${err.message} → OFFLINE`
          );
        } catch (_) {}
        resolve();
      });
    });
  }
}
