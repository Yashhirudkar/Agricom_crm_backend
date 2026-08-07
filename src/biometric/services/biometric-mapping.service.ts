import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { Employee } from '../../hrms/models/employee.model';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class BiometricMappingService {
  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // 1. Fetch unique unknown biometric users
  async getUnknownUsers(companyId: number): Promise<any[]> {
    return this.punchLogModel.findAll({
      attributes: [
        'biometricUserId',
        [this.punchLogModel.sequelize.fn('MAX', this.punchLogModel.sequelize.col('timestamp')), 'lastPunchTime'],
        [this.punchLogModel.sequelize.fn('COUNT', this.punchLogModel.sequelize.col('id')), 'punchCount'],
      ],
      where: { companyId, status: BiometricPunchStatus.UNKNOWN_USER },
      group: ['biometricUserId'],
      order: [[this.punchLogModel.sequelize.fn('MAX', this.punchLogModel.sequelize.col('timestamp')), 'DESC']],
    });
  }

  // 2. Map a single biometric user ID (Enforces immutability of employeeCode)
  async mapBiometricUser(companyId: number, biometricUserId: string, employeeId: number): Promise<any> {
    const employee = await this.employeeModel.findOne({
      where: { id: employeeId, companyId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // STRICT IDENTITY VALIDATION
    // Ensure the biometric device user ID matches the employee code
    if (employee.employeeCode.trim() !== biometricUserId.trim()) {
      throw new BadRequestException(
        `Machine User ID (${biometricUserId}) does not match Employee Code (${employee.employeeCode}). ` +
        `Please register the employee on the biometric device using the correct Employee Code.`
      );
    }

    const t = await this.punchLogModel.sequelize.transaction();
    try {
      // Requeue matching unknown punch logs to PENDING with HIGH priority
      const [updatedCount] = await this.punchLogModel.update(
        {
          status: BiometricPunchStatus.PENDING,
          priority: 'HIGH',
          nextRetryAt: new Date(),
        },
        {
          where: { companyId, biometricUserId, status: BiometricPunchStatus.UNKNOWN_USER },
          transaction: t,
        },
      );

      await t.commit();

      // Trigger immediate processing queue worker
      this.eventEmitter.emit('biometric.v1.punch.received', {
        companyId,
        deviceSerialNumber: 'SYSTEM_MAPPED',
      });

      return {
        success: true,
        message: `Employee mapped successfully. Requeued ${updatedCount} punches to PENDING.`,
        updatedCount,
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // 3. Bulk map multiple biometric user IDs at once
  async mapBulkBiometricUsers(
    companyId: number,
    mappings: Array<{ biometricUserId: string; employeeId: number }>,
  ): Promise<any> {
    const t = await this.punchLogModel.sequelize.transaction();
    let totalUpdatedLogs = 0;
    const mappedUsersCount = mappings.length;

    try {
      for (const mapping of mappings) {
        const employee = await this.employeeModel.findOne({
          where: { id: mapping.employeeId, companyId },
          transaction: t,
        });

        if (!employee) {
          throw new NotFoundException(`Employee with ID ${mapping.employeeId} not found during bulk mapping`);
        }

        // STRICT IDENTITY VALIDATION
        if (employee.employeeCode.trim() !== mapping.biometricUserId.trim()) {
          throw new BadRequestException(
            `Machine User ID (${mapping.biometricUserId}) does not match Employee Code (${employee.employeeCode}) ` +
            `for Employee ${employee.firstName} ${employee.lastName}. Bulk mapping aborted.`
          );
        }

        // Requeue logs
        const [updatedCount] = await this.punchLogModel.update(
          {
            status: BiometricPunchStatus.PENDING,
            priority: 'HIGH',
            nextRetryAt: new Date(),
          },
          {
            where: { companyId, biometricUserId: mapping.biometricUserId, status: BiometricPunchStatus.UNKNOWN_USER },
            transaction: t,
          },
        );

        totalUpdatedLogs += updatedCount;
      }

      await t.commit();

      // Trigger queue worker
      this.eventEmitter.emit('biometric.v1.punch.received', {
        companyId,
        deviceSerialNumber: 'SYSTEM_BULK_MAPPED',
      });

      return {
        success: true,
        message: `Bulk validated and mapped ${mappedUsersCount} users. Requeued ${totalUpdatedLogs} punches for processing.`,
        mappedUsersCount,
        totalUpdatedLogs,
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
