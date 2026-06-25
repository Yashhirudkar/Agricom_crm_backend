import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../../users/models/user.model';
import { Employee } from '../../hrms/models/employee.model';
import { UserPreference } from '../../users/models/user-preference.model';
import {
  ProfileActivityLog,
  ActorType,
} from '../models/profile-activity-log.model';
import { UserPasswordHistory } from '../../users/models/user-password-history.model';
import { EmployeeDocument } from '../../hrms/models/employee-document.model';
import { EmployeeLeaveBalance } from '../../hrms/models/employee-leave-balance.model';
import { UserSession } from '../../users/models/user-session.model';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdatePersonalDto } from '../dto/update-personal.dto';
import { UpdateEmergencyContactDto } from '../dto/update-emergency-contact.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import { Role } from '../../rbac/models/role.model';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../../hrms/models/designation.model';
import { Branch } from '../../hrms/models/branch.model';
import { Company } from '../../companies/models/company.model';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
    @InjectModel(Employee) private employeeModel: typeof Employee,
    @InjectModel(UserPreference) private userPrefModel: typeof UserPreference,
    @InjectModel(ProfileActivityLog)
    private activityLogModel: typeof ProfileActivityLog,
    @InjectModel(UserPasswordHistory)
    private passwordHistoryModel: typeof UserPasswordHistory,
    @InjectModel(EmployeeDocument)
    private documentModel: typeof EmployeeDocument,
    @InjectModel(EmployeeLeaveBalance)
    private leaveBalanceModel: typeof EmployeeLeaveBalance,
    @InjectModel(UserSession) private sessionModel: typeof UserSession,
  ) {}

  private checkActive(user: User) {
    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive.');
    }
  }

  async getProfile(userId: number, userType: string) {
    const isSuperAdmin = userType === 'super_admin';

    const user = await this.userModel.findByPk(userId, {
      attributes: [
        'id',
        'name',
        'email',
        'avatarUrl',
        'isActive',
        'status',
        'lastLogin',
      ],
    });

    if (!user) throw new NotFoundException('User not found');

    const prefs = await this.userPrefModel.findOne({ where: { userId } });

    if (userType === 'super_admin' || userType === 'client_admin') {
      return { user, preferences: prefs, type: 'ACCOUNT_LEVEL' };
    }

    const employee = await this.employeeModel.findOne({
      where: { userId },
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Designation, attributes: ['id', 'name'] },
        { model: Branch, attributes: ['id', 'branchName'] },
        { model: Company, attributes: ['id', 'name'] },
        {
          model: Employee,
          as: 'manager',
          attributes: ['id', 'firstName', 'lastName'],
        },
      ],
      attributes: { exclude: ['salary'] },
    });

    return { user, employee, preferences: prefs, type: 'FULL' };
  }

  async getPreferences(userId: number) {
    let prefs = await this.userPrefModel.findOne({ where: { userId } });
    if (!prefs) {
      prefs = await this.userPrefModel.create({ userId });
    }
    return prefs;
  }

  async getActivity(userId: number) {
    return this.activityLogModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
  }

  async getLeaveSummary(userId: number, userType: string) {
    if (userType === 'super_admin' || userType === 'client_admin') {
      return [];
    }
    const employee = await this.employeeModel.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.leaveBalanceModel.findAll({
      where: { employeeId: employee.id },
    });
  }

  async getDocumentStatus(userId: number, userType: string) {
    if (userType === 'super_admin' || userType === 'client_admin') {
      return [];
    }
    const employee = await this.employeeModel.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.documentModel.findAll({
      where: { employeeId: employee.id },
      attributes: ['id', 'documentType', 'verificationStatus', 'isMandatory'],
    });
  }

  async getAttendanceSummary(userId: number, userType: string) {
    if (userType === 'super_admin' || userType === 'client_admin') {
      return {
        attendancePercentage: 0,
        presentDays: 0,
        absentDays: 0,
        lateEntries: 0,
      };
    }
    // Mocking attendance summary since actual attendance module might not be fully there
    return {
      attendancePercentage: 95,
      presentDays: 20,
      absentDays: 1,
      lateEntries: 0,
    };
  }

  async getSessionInfo(userId: number) {
    return this.sessionModel.findAll({
      where: { userId },
      order: [['lastActivityAt', 'DESC']],
    });
  }

  async getCompletion(userId: number, userType: string) {
    if (userType === 'super_admin' || userType === 'client_admin') {
      return { completionPercentage: 100 }; // simple for super admin
    }
    const employee = await this.employeeModel.findOne({ where: { userId } });
    if (!employee) return { completionPercentage: 0 };

    let total = 0;
    let filled = 0;
    const fields = [
      'firstName',
      'lastName',
      'mobile',
      'personalEmail',
      'dob',
      'gender',
      'address',
      'city',
      'state',
      'country',
      'emergencyContactName',
      'emergencyContactNumber',
    ];
    fields.forEach((f) => {
      total++;
      if (employee[f as keyof Employee]) filled++;
    });

    const user = await this.userModel.findByPk(userId);
    total++;
    if (user?.avatarUrl) filled++;

    return {
      completionPercentage: Math.round((filled / total) * 100),
    };
  }

  async updatePersonal(userId: number, dto: UpdatePersonalDto, req: any) {
    const user = await this.userModel.findByPk(userId);
    this.checkActive(user);

    const employee = await this.employeeModel.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    // Optimistic locking with 1 second precision allowance
    if (
      Math.abs(
        new Date(dto.updatedAt).getTime() -
          new Date(employee.updatedAt).getTime(),
      ) > 1000
    ) {
      throw new ConflictException(
        'Record was updated by another process. Please refresh.',
      );
    }

    const oldValues = { ...employee.toJSON() };

    await employee.update({
      firstName: dto.firstName,
      lastName: dto.lastName,
      mobile: dto.mobile,
      personalEmail: dto.personalEmail,
      dob: dto.dob,
      gender: dto.gender,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      country: dto.country,
    });

    // Log changes
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    for (const key of Object.keys(dto)) {
      if (
        key !== 'updatedAt' &&
        oldValues[key] !== (dto as any)[key] &&
        (dto as any)[key] !== undefined
      ) {
        await this.activityLogModel.create({
          userId,
          fieldName: key,
          oldValue: oldValues[key]?.toString(),
          newValue: (dto as any)[key]?.toString(),
          actorType: ActorType.EMPLOYEE,
          ipAddress,
          userAgent,
        });
      }
    }

    await employee.reload();
    return { message: 'Updated successfully', updatedAt: employee.updatedAt };
  }

  async updateEmergencyContact(
    userId: number,
    dto: UpdateEmergencyContactDto,
    req: any,
  ) {
    const user = await this.userModel.findByPk(userId);
    this.checkActive(user);

    const employee = await this.employeeModel.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');

    if (
      Math.abs(
        new Date(dto.updatedAt).getTime() -
          new Date(employee.updatedAt).getTime(),
      ) > 1000
    ) {
      throw new ConflictException(
        'Record was updated by another process. Please refresh.',
      );
    }

    const oldValues = { ...employee.toJSON() };

    await employee.update({
      emergencyContactName: dto.emergencyContactName,
      emergencyContactNumber: dto.emergencyContactNumber,
      emergencyContactRelation: dto.emergencyContactRelation,
    });

    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    for (const key of Object.keys(dto)) {
      if (
        key !== 'updatedAt' &&
        oldValues[key] !== (dto as any)[key] &&
        (dto as any)[key] !== undefined
      ) {
        await this.activityLogModel.create({
          userId,
          fieldName: key,
          oldValue: oldValues[key]?.toString(),
          newValue: (dto as any)[key]?.toString(),
          actorType: ActorType.EMPLOYEE,
          ipAddress,
          userAgent,
        });
      }
    }

    await employee.reload();
    return { message: 'Updated successfully', updatedAt: employee.updatedAt };
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    let prefs = await this.userPrefModel.findOne({ where: { userId } });
    if (!prefs) {
      prefs = await this.userPrefModel.create({ userId });
    } else {
      if (
        dto.updatedAt &&
        Math.abs(
          new Date(dto.updatedAt).getTime() -
            new Date(prefs.updatedAt).getTime(),
        ) > 1000
      ) {
        throw new ConflictException(
          'Record was updated by another process. Please refresh.',
        );
      }
    }

    await prefs.update({
      twoFactorEnabled:
        dto.twoFactorEnabled !== undefined
          ? dto.twoFactorEnabled
          : prefs.twoFactorEnabled,
      emailNotifications:
        dto.emailNotifications !== undefined
          ? dto.emailNotifications
          : prefs.emailNotifications,
      pushNotifications:
        dto.pushNotifications !== undefined
          ? dto.pushNotifications
          : prefs.pushNotifications,
      theme: dto.theme !== undefined ? dto.theme : prefs.theme,
    });

    await prefs.reload();
    return { message: 'Updated successfully', updatedAt: prefs.updatedAt };
  }

  async uploadPhoto(userId: number, file: Express.Multer.File) {
    const user = await this.userModel.findByPk(userId);
    this.checkActive(user);

    try {
      const avatarUrl = `/uploads/profile/${file.filename}`;
      await user.update({ avatarUrl });
      return { message: 'Photo uploaded successfully', avatarUrl };
    } catch (error) {
      if (file && file.path) {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.error('Failed to unlink file during rollback', e);
        }
      }
      throw new BadRequestException('Database update failed');
    }
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userModel.findByPk(userId);
    this.checkActive(user);

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Incorrect old password');
    }

    // Check history
    const histories = await this.passwordHistoryModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    for (const h of histories) {
      const reuse = await bcrypt.compare(dto.newPassword, h.passwordHash);
      if (reuse) {
        throw new BadRequestException('Cannot reuse an old password');
      }
    }

    const hashedNew = await bcrypt.hash(dto.newPassword, 10);
    await user.update({ password: hashedNew });

    // Store in history
    await this.passwordHistoryModel.create({
      userId,
      passwordHash: hashedNew,
    });

    // Prune history to last 5
    const newHistories = await this.passwordHistoryModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    if (newHistories.length > 5) {
      const toDelete = newHistories.slice(5);
      for (const old of toDelete) {
        await old.destroy();
      }
    }

    return { message: 'Password updated successfully' };
  }

  async getAdminAudit(userId: number, targetUserId: number) {
    return this.activityLogModel.findAll({
      where: { userId: targetUserId },
      order: [['createdAt', 'DESC']],
    });
  }
}
