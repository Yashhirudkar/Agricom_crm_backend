import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricPunchLog } from '../models/biometric-punch-log.model';
import { AttendanceRecord } from '../../attendance/models/attendance-record.model';
import { Employee } from '../../hrms/models/employee.model';

@Injectable()
export class BiometricLogService {
  constructor(
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
  ) {}

  async getPunchLogs(
    companyId: number,
    filters: {
      status?: string;
      biometricUserId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ rows: BiometricPunchLog[]; count: number }> {
    const whereClause: any = { companyId };
    if (filters.status) {
      whereClause.status = filters.status;
    }
    if (filters.biometricUserId) {
      whereClause.biometricUserId = filters.biometricUserId;
    }

    return this.punchLogModel.findAndCountAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: filters.limit ? Number(filters.limit) : 50,
      offset: filters.offset ? Number(filters.offset) : 0,
      include: [
        {
          model: AttendanceRecord,
          required: false,
          include: [
            {
              model: Employee,
              required: false,
              attributes: ['id', 'firstName', 'lastName', 'employeeCode'],
            },
          ],
        },
      ],
    });
  }
}
