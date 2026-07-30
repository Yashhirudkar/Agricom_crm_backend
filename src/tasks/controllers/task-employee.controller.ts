import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Employee, EmployeeStatus } from '../../hrms/models/employee.model';
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
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  @Get('assignable')
  async getAssignableEmployees(
    @Req() req: any,
    @Query('search') search?: string,
  ) {
    const headerCompanyId = req.headers['x-company-id'];
    const rawCompanyId = headerCompanyId
      ? parseInt(headerCompanyId, 10)
      : (req.user?.companyId || req.user?.clientId || req.user?.lastCompanyId);

    const companyId = rawCompanyId && !isNaN(rawCompanyId) ? rawCompanyId : undefined;

    // 1. Fetch Employees
    const empWhere: any = {
      status: {
        [Op.notIn]: [EmployeeStatus.TERMINATED, EmployeeStatus.RESIGNED],
      },
      departmentId: { [Op.ne]: null },
      designationId: { [Op.ne]: null },
    };

    if (companyId) {
      empWhere.companyId = companyId;
    }

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      empWhere[Op.or] = [
        { firstName: { [Op.iLike]: pattern } },
        { lastName: { [Op.iLike]: pattern } },
        { email: { [Op.iLike]: pattern } },
      ];
    }

    const employees = await this.employeeModel.findAll({
      where: empWhere,
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
      limit: 500,
    });

    // 2. Fetch Users by matching employee emails (avoids clientId mismatch)
    const employeeEmails = employees
      .map((e) => e.email)
      .filter(Boolean)
      .map((e) => e!.toLowerCase().trim());

    const employeeUserIds = employees
      .map((e) => e.userId)
      .filter(Boolean) as number[];

    const userWhere: any = {
      [Op.or]: [
        ...(employeeEmails.length ? [{ email: { [Op.in]: employeeEmails } }] : []),
        ...(employeeUserIds.length ? [{ id: { [Op.in]: employeeUserIds } }] : []),
        ...(companyId ? [{ clientId: companyId }, { lastCompanyId: companyId }] : []),
      ],
      status: { [Op.notIn]: ['Inactive', 'Suspended', 'inactive', 'suspended'] },
    };

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      // When searching, also include name matches
      userWhere[Op.or] = [
        ...(userWhere[Op.or] || []),
        { name: { [Op.iLike]: pattern } },
        { email: { [Op.iLike]: pattern } },
      ];
    }

    const users = await this.userModel.findAll({
      where: userWhere,
      attributes: ['id', 'name', 'email', 'avatarUrl'],
      limit: 500,
    });

    // Create lookup maps for fast matching
    const userByEmail = new Map<string, User>();
    const userById = new Map<number, User>();
    for (const u of users) {
      if (u.email) userByEmail.set(u.email.toLowerCase().trim(), u);
      userById.set(u.id, u);
    }

    const resultMap = new Map<string, any>();

    for (const emp of employees) {
      const empEmail = emp.email ? emp.email.toLowerCase().trim() : '';

      let linkedUser: User | undefined;
      if (empEmail) {
        linkedUser = userByEmail.get(empEmail);
      }
      if (!linkedUser && emp.userId) {
        const candidateUser = userById.get(emp.userId);
        if (candidateUser) {
          const candidateEmail = (candidateUser.email || '').toLowerCase().trim();
          if (!candidateEmail || !empEmail || candidateEmail === empEmail) {
            linkedUser = candidateUser;
          }
        }
      }
      if (!linkedUser && emp.user) {
        const candidateEmail = (emp.user.email || '').toLowerCase().trim();
        if (!candidateEmail || !empEmail || candidateEmail === empEmail) {
          linkedUser = emp.user;
        }
      }

      // Auto-create User account for employee if not linked (self-healing)
      if (!linkedUser && empEmail) {
        try {
          const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Employee';
          // Use clientId from request user for creating User account
          const newUserClientId = req.user?.clientId || companyId || null;

          // Check by email first (might already exist with different casing)
          let existingUser = await this.userModel.findOne({
            where: { email: empEmail },
            attributes: ['id', 'name', 'email', 'avatarUrl'],
          });

          if (!existingUser) {
            existingUser = await this.userModel.create({
              name: fullName,
              email: empEmail,
              password: `EmpAuto@${emp.id}!`,
              clientId: newUserClientId,
              status: 'Active',
              isActive: true,
            } as any);
          }

          if (existingUser) {
            linkedUser = existingUser;
            userByEmail.set(empEmail, existingUser);
            userById.set(existingUser.id, existingUser);
            // Update employee record to link userId
            await this.employeeModel.update(
              { userId: existingUser.id },
              { where: { id: emp.id } },
            );
          }
        } catch (e) {
          // If auto-create fails (e.g. email collision on concurrent request), skip safely
        }
      }

      // Still no user account (no email either) — skip this employee
      if (!linkedUser) continue;

      const rawFirstName = (emp.firstName || (linkedUser.name ? linkedUser.name.split(' ')[0] : '') || '').replace(/\s+/g, ' ').trim();
      const rawLastName = (emp.lastName || (linkedUser.name ? linkedUser.name.split(' ').slice(1).join(' ') : '') || '').replace(/\s+/g, ' ').trim();

      const key = `emp-${emp.id}`;

      resultMap.set(key, {
        id: emp.id,
        userId: linkedUser.id,
        firstName: rawFirstName,
        lastName: rawLastName,
        email: emp.email || linkedUser.email,
        status: emp.status || 'ACTIVE',
        user: linkedUser.toJSON(),
      });
    }

    // Process Standalone Users
    const existingUserIds = new Set(
      Array.from(resultMap.values()).map((item) => item.userId),
    );

    for (const u of users) {
      if (!existingUserIds.has(u.id)) {
        const key = `user-${u.id}`;
        const nameParts = (u.name || '').trim().replace(/\s+/g, ' ').split(' ');
        resultMap.set(key, {
          id: null,
          userId: u.id,
          firstName: nameParts[0] || u.name || '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: u.email,
          status: 'ACTIVE',
          user: u.toJSON(),
        });
      }
    }

    return {
      success: true,
      data: Array.from(resultMap.values()),
    };
  }
}
