import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Employee } from '../../hrms/models/employee.model';
import { User } from '../../users/models/user.model';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('v1/tasks/employees')
@UseGuards(JwtAuthGuard)
export class TaskEmployeeController {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
  ) {}

  @Get('assignable')
  async getAssignableEmployees(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: number,
    @Query('designationId') designationId?: number,
  ) {
    const headerCompanyId = req.headers['x-company-id'];
    const clientId = headerCompanyId
      ? parseInt(headerCompanyId, 10)
      : req.user.clientId;

    const whereClause: any = {
      // Include all statuses where employee can be actively assigned work
      status: {
        [Op.in]: ['ACTIVE', 'CONFIRMED', 'PROBATION', 'ONBOARDING'],
      },
    };
    if (clientId) {
      whereClause.companyId = clientId;
    }

    if (departmentId) whereClause.departmentId = departmentId;
    if (designationId) whereClause.designationId = designationId;

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const employees = await this.employeeModel.findAll({
      where: whereClause,
      attributes: [
        'id',
        'userId',
        'firstName',
        'lastName',
        'email',
        'designationId',
        'departmentId',
        'status',
      ],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatarUrl'],
          required: false,
        },
      ],
      order: [['firstName', 'ASC']],
      limit: 100,
    });

    return {
      success: true,
      data: employees,
    };
  }
}
