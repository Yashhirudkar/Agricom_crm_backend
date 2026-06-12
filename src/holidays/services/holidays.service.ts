import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Holiday } from '../models/holiday.model';
import { HolidayCompany } from '../models/holiday-company.model';
import { CreateHolidayDto, UpdateHolidayDto, GetHolidaysFilterDto } from '../dto/holiday.dto';
import { AuditService } from '../../audit/services/audit.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { UserCompany } from '../../users/models/user-company.model';
import { User } from '../../users/models/user.model';
import { Company } from '../../companies/models/company.model';
import { Op } from 'sequelize';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    @InjectModel(HolidayCompany)
    private readonly holidayCompanyModel: typeof HolidayCompany,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createHoliday(
    clientId: number,
    dto: CreateHolidayDto,
    actor: { userId: number; ipAddress?: string; userAgent?: string }
  ) {
    let holiday: Holiday;
    try {
      holiday = await this.holidayModel.create({
        clientId,
        title: dto.title,
        holidayDate: dto.holidayDate as any,
        holidayType: dto.holidayType,
        description: dto.description || null,
        isOptional: dto.isOptional || false,
        createdBy: actor.userId,
      });

      if (dto.companyIds && dto.companyIds.length > 0) {
        const mappings = dto.companyIds.map((cId) => ({
          holidayId: holiday.id,
          companyId: cId,
        }));
        await this.holidayCompanyModel.bulkCreate(mappings);
      }
    } catch (error) {
      throw new BadRequestException('Error creating holiday: ' + error.message);
    }

    const createdHoliday = await this.getHolidayById(holiday.id, clientId);

    await this.auditService.writeDiffLog({
      clientId,
      companyId: null,
      userId: actor.userId,
      entityType: 'Holiday',
      entityId: holiday.id,
      action: 'CREATE',
      newRecord: createdHoliday,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Notifications
    await this.notifyUsers(createdHoliday, 'New Holiday Added', `A new holiday '${holiday.title}' has been scheduled for ${holiday.holidayDate}.`);

    return createdHoliday;
  }

  async getHolidays(clientId: number, filter: GetHolidaysFilterDto) {
    const where: any = { clientId, isActive: true };

    if (filter.search) {
      where.title = { [Op.iLike]: `%${filter.search}%` };
    }
    if (filter.holidayType) {
      where.holidayType = filter.holidayType;
    }
    if (filter.startDate && filter.endDate) {
      where.holidayDate = { [Op.between]: [filter.startDate, filter.endDate] };
    } else if (filter.startDate) {
      where.holidayDate = { [Op.gte]: filter.startDate };
    } else if (filter.endDate) {
      where.holidayDate = { [Op.lte]: filter.endDate };
    }

    const include: any[] = [
      {
        model: HolidayCompany,
        include: [{ model: Company, attributes: ['id', 'name'] }],
      },
    ];

    if (filter.companyId) {
      include[0].where = { companyId: filter.companyId };
      include[0].required = false; // We will handle logic for 'All Companies' below
    }

    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;

    const holidays = await this.holidayModel.findAndCountAll({
      where,
      include,
      order: [[filter.sortBy || 'holidayDate', filter.sortOrder || 'ASC']],
      limit,
      offset,
      distinct: true,
    });

    if (filter.companyId) {
      // Filter out holidays that are restricted to other companies
      holidays.rows = holidays.rows.filter(h => {
        if (h.holidayCompanies && h.holidayCompanies.length > 0) {
          return h.holidayCompanies.some(hc => hc.companyId == filter.companyId);
        }
        return true; // Client level holiday (applies to all companies)
      });
      holidays.count = holidays.rows.length;
    }

    return {
      data: holidays.rows,
      total: holidays.count,
      page,
      limit,
    };
  }

  async getUpcomingHolidays(clientId: number, companyId: number) {
    const today = new Date().toISOString().split('T')[0];
    
    const holidays = await this.holidayModel.findAll({
      where: {
        clientId,
        isActive: true,
        holidayDate: { [Op.gte]: today },
      },
      include: [
        {
          model: HolidayCompany,
        },
      ],
      order: [['holidayDate', 'ASC']],
      limit: 5,
    });

    return holidays.filter(h => {
      if (h.holidayCompanies && h.holidayCompanies.length > 0) {
        return h.holidayCompanies.some(hc => hc.companyId == companyId);
      }
      return true;
    });
  }

  async getHolidayById(id: number, clientId: number) {
    const holiday = await this.holidayModel.findOne({
      where: { id, clientId },
      include: [
        {
          model: HolidayCompany,
          include: [{ model: Company, attributes: ['id', 'name'] }],
        },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: User, as: 'updater', attributes: ['id', 'name'] },
      ],
    });

    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }

  async updateHoliday(
    id: number,
    clientId: number,
    dto: UpdateHolidayDto,
    actor: { userId: number; ipAddress?: string; userAgent?: string }
  ) {
    const holiday = await this.getHolidayById(id, clientId);
    const oldRecord = holiday.toJSON();

    if (dto.title !== undefined) holiday.title = dto.title;
    if (dto.holidayDate !== undefined) holiday.holidayDate = dto.holidayDate as any;
    if (dto.holidayType !== undefined) holiday.holidayType = dto.holidayType;
    if (dto.description !== undefined) holiday.description = dto.description;
    if (dto.isOptional !== undefined) holiday.isOptional = dto.isOptional;
    if (dto.isActive !== undefined) holiday.isActive = dto.isActive;
    
    holiday.updatedBy = actor.userId;
    await holiday.save();

    if (dto.companyIds !== undefined) {
      await this.holidayCompanyModel.destroy({ where: { holidayId: id } });
      if (dto.companyIds.length > 0) {
        const mappings = dto.companyIds.map(cId => ({ holidayId: id, companyId: cId }));
        await this.holidayCompanyModel.bulkCreate(mappings);
      }
    }

    const updatedRecord = await this.getHolidayById(id, clientId);

    await this.auditService.writeDiffLog({
      clientId,
      companyId: null,
      userId: actor.userId,
      entityType: 'Holiday',
      entityId: holiday.id,
      action: 'UPDATE',
      oldRecord,
      newRecord: updatedRecord,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return updatedRecord;
  }

  async deleteHoliday(
    id: number,
    clientId: number,
    actor: { userId: number; ipAddress?: string; userAgent?: string }
  ) {
    const holiday = await this.getHolidayById(id, clientId);
    const oldRecord = holiday.toJSON();

    await this.holidayCompanyModel.destroy({ where: { holidayId: id } });
    await holiday.destroy();

    await this.auditService.writeDiffLog({
      clientId,
      companyId: null,
      userId: actor.userId,
      entityType: 'Holiday',
      entityId: holiday.id,
      action: 'DELETE',
      oldRecord,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { message: 'Holiday deleted successfully' };
  }

  private async notifyUsers(holiday: Holiday, title: string, message: string) {
    let targetUserIds: number[] = [];

    if (holiday.holidayCompanies && holiday.holidayCompanies.length > 0) {
      const companyIds = holiday.holidayCompanies.map(hc => hc.companyId);
      const userComps = await this.userCompanyModel.findAll({
        where: { companyId: { [Op.in]: companyIds } }
      });
      targetUserIds = [...new Set(userComps.map(uc => uc.userId))];
    } else {
      // Client level holiday, fetch all users of this client via userCompany mapping of client's companies
      const companies = await Company.findAll({ where: { clientId: holiday.clientId } });
      const companyIds = companies.map(c => c.id);
      const userComps = await this.userCompanyModel.findAll({
        where: { companyId: { [Op.in]: companyIds } }
      });
      targetUserIds = [...new Set(userComps.map(uc => uc.userId))];
    }

    for (const uId of targetUserIds) {
      await this.notificationsService.createNotification({
        userId: uId,
        title,
        message,
        type: 'HOLIDAY',
        entityType: 'Holiday',
        entityId: holiday.id,
      });
    }
  }
}
