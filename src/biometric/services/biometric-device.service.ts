import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricDevice, BiometricDeviceStatus } from '../models/biometric-device.model';
import * as crypto from 'crypto';

@Injectable()
export class BiometricDeviceService {
  constructor(
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
  ) {}

  // 1. Register Device
  async createDevice(companyId: number, data: {
    name: string;
    ipAddress: string;
    port?: number;
    serialNumber: string;
    branchId?: number;
    timeOffset?: number;
  }): Promise<BiometricDevice> {
    const existing = await this.deviceModel.findOne({
      where: { serialNumber: data.serialNumber },
      paranoid: false,
    });

    if (existing) {
      if (existing.deletedAt) {
        // Restore soft-deleted device with updated properties
        await existing.update({
          ...data,
          companyId,
          deletedAt: null,
          deletedBy: null,
          isActive: true,
          status: BiometricDeviceStatus.OFFLINE,
          configVersion: existing.configVersion + 1,
        });
        return existing;
      }
      throw new ConflictException({
        statusCode: 409,
        message: `Biometric device with serial number ${data.serialNumber} already exists.`,
        field: 'serialNumber',
      });
    }

    // Auto-generate a secure random 32-character secret key for HMAC signatures
    const secretKey = crypto.randomBytes(16).toString('hex');

    try {
      return await this.deviceModel.create({
        ...data,
        companyId,
        secretKey,
        status: BiometricDeviceStatus.OFFLINE,
        configVersion: 1,
        maintenanceMode: false,
      });
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError' || err.code === '23505') {
        throw new ConflictException({
          statusCode: 409,
          message: `Biometric device with serial number ${data.serialNumber} already exists.`,
          field: 'serialNumber',
        });
      }
      throw err;
    }
  }

  // 2. Get All Active Devices
  async getDevices(companyId: number): Promise<BiometricDevice[]> {
    return this.deviceModel.findAll({
      where: { companyId, deletedAt: null },
      order: [['createdAt', 'ASC']],
    });
  }

  // 3. Get Device By ID
  async getDeviceById(companyId: number, id: number): Promise<BiometricDevice> {
    const device = await this.deviceModel.findOne({
      where: { id, companyId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException(`Biometric device with ID ${id} not found`);
    }

    return device;
  }

  // 4. Update Device Configuration (Increments configuration version)
  async updateDevice(
    companyId: number,
    id: number,
    data: {
      name?: string;
      ipAddress?: string;
      port?: number;
      branchId?: number;
      timeOffset?: number;
      isActive?: boolean;
      maintenanceMode?: boolean;
    },
  ): Promise<BiometricDevice> {
    const device = await this.getDeviceById(companyId, id);

    // Bump configVersion when configuration updates so Sync Agent gets notified
    await device.update({
      ...data,
      configVersion: device.configVersion + 1,
    });
    return device;
  }

  // 5. Soft Delete Device (Sets deletedAt, deactivates, bumps configVersion)
  async deleteDevice(companyId: number, id: number, userId?: number): Promise<void> {
    const device = await this.getDeviceById(companyId, id);
    await device.update({
      deletedAt: new Date(),
      deletedBy: userId || null,
      isActive: false,
      configVersion: device.configVersion + 1,
    });
  }

  // 6. Ping / Heartbeat Ingestion
  async pingDevice(device: BiometricDevice, ipAddress?: string): Promise<BiometricDevice> {
    const updates: any = {
      lastHeartbeat: new Date(),
    };

    // If device is in maintenance mode, heartbeat status check alerts are skipped
    if (!device.maintenanceMode) {
      updates.status = BiometricDeviceStatus.ONLINE;
    }

    if (ipAddress && device.ipAddress !== ipAddress) {
      updates.ipAddress = ipAddress;
    }

    await device.update(updates);
    return device;
  }

  // 7. Regenerate HMAC Security Key
  async regenerateSecretKey(companyId: number, id: number): Promise<BiometricDevice> {
    const device = await this.getDeviceById(companyId, id);
    const newSecretKey = crypto.randomBytes(16).toString('hex');
    await device.update({
      secretKey: newSecretKey,
      configVersion: device.configVersion + 1,
    });
    return device;
  }
}
