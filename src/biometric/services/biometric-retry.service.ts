import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BiometricRetryService {
  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // 1. Retry a single failed punch
  async retryFailedPunch(companyId: number, id: number): Promise<BiometricPunchLog> {
    const punch = await this.punchLogModel.findOne({
      where: { id, companyId, status: BiometricPunchStatus.FAILED },
    });

    if (!punch) {
      throw new NotFoundException(`Failed punch log with ID ${id} not found`);
    }

    // Reset status to PENDING with HIGH priority to run next
    await punch.update({
      status: BiometricPunchStatus.PENDING,
      priority: 'HIGH',
      nextRetryAt: new Date(),
      retryCount: 0,
      lastError: null,
    });

    // Wake up queue processor
    this.eventEmitter.emit('biometric.v1.punch.received', {
      companyId,
      deviceSerialNumber: punch.deviceSerialNumber,
    });

    return punch;
  }

  // 2. Bulk retry all failed punches in a company
  async retryAllFailedPunches(companyId: number): Promise<any> {
    const [updatedCount] = await this.punchLogModel.update(
      {
        status: BiometricPunchStatus.PENDING,
        priority: 'HIGH',
        nextRetryAt: new Date(),
        retryCount: 0,
        lastError: null,
      },
      {
        where: { companyId, status: BiometricPunchStatus.FAILED },
      },
    );

    if (updatedCount > 0) {
      // Wake up queue processor
      this.eventEmitter.emit('biometric.v1.punch.received', {
        companyId,
        deviceSerialNumber: 'SYSTEM_BULK_RETRY',
      });
    }

    return {
      success: true,
      message: `Successfully requeued ${updatedCount} failed punches for reprocessing at HIGH priority.`,
      updatedCount,
    };
  }
}
