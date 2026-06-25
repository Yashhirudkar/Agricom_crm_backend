import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AttendanceRecord } from '../models/attendance-record.model';
import {
  AttendanceException,
  AttendanceExceptionStatus,
} from '../models/attendance-exception.model';
import { Employee } from '../../hrms/models/employee.model';
import { Op } from 'sequelize';
import { User } from '../../users/models/user.model';
import { Designation } from '../../hrms/models/designation.model';

@Injectable()
export class AttendanceExceptionsQueryService {
  constructor(
    @InjectModel(AttendanceException)
    private readonly exceptionModel: typeof AttendanceException,
  ) {}

  async getPendingCorrections(
    companyId: number,
  ): Promise<AttendanceException[]> {
    return this.exceptionModel.findAll({
      where: { status: AttendanceExceptionStatus.PENDING },
      include: [
        {
          model: Employee,
          as: 'employee',
          where: { companyId },
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
            {
              model: Designation,
              as: 'designation',
              attributes: ['id', 'name'],
            },
          ],
        },
        { model: AttendanceRecord, as: 'attendanceRecord' },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async getRegularizationHistory(companyId: number, query: any): Promise<any> {
    const {
      page = 1,
      limit = 10,
      status,
      employeeId,
      search,
      startDate,
      endDate,
      approverId,
    } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    } else {
      whereClause.status = {
        [Op.in]: [
          AttendanceExceptionStatus.APPROVED,
          AttendanceExceptionStatus.REJECTED,
        ],
      };
    }

    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    if (approverId) {
      whereClause.approvedBy = approverId;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = endD;
      }
    }

    const employeeWhere: any = { companyId };
    const userWhere: any = {};
    if (search) {
      userWhere.name = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await this.exceptionModel.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'employee',
          where: employeeWhere,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email'],
              where: search ? userWhere : undefined,
              required: !!search,
            },
            {
              model: Designation,
              as: 'designation',
              attributes: ['id', 'name'],
            },
          ],
        },
        {
          model: Employee,
          as: 'approver',
          required: false,
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
            {
              model: Designation,
              as: 'designation',
              attributes: ['id', 'name'],
            },
          ],
        },
        { model: AttendanceRecord, as: 'attendanceRecord' },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      totalCount: count,
      page,
      totalPages: Math.ceil(count / limit),
    };
  }
}
