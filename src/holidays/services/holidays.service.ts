import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Holiday } from '../models/holiday.model';
import { HolidayCompany } from '../models/holiday-company.model';
import {
  CreateHolidayDto,
  UpdateHolidayDto,
  GetHolidaysFilterDto,
  CreateRecurringHolidayDto,
} from '../dto/holiday.dto';
import { AuditService } from '../../audit/services/audit.service';
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
  ) {}

  async createHoliday(
    clientId: number,
    dto: CreateHolidayDto,
    actor: { userId: number; ipAddress?: string; userAgent?: string },
  ) {
    let holiday: Holiday;
    const t = await this.holidayModel.sequelize.transaction();
    try {
      await this.validateConflict(clientId, dto, t);

      holiday = await this.holidayModel.create(
        {
          clientId,
          title: dto.title,
          holidayDate: dto.holidayDate as any,
          holidayType: dto.holidayType,
          description: dto.description || null,
          isOptional: dto.isOptional || false,
          isWeeklyOff: dto.isWeeklyOff || false,
          isHalfDay: dto.isHalfDay || false,
          halfDayStart: dto.halfDayStart || null,
          halfDayEnd: dto.halfDayEnd || null,
          createdBy: actor.userId,
        },
        { transaction: t },
      );

      if (dto.companyIds && dto.companyIds.length > 0) {
        const mappings = dto.companyIds.map((cId) => ({
          holidayId: holiday.id,
          companyId: cId,
        }));
        await this.holidayCompanyModel.bulkCreate(mappings, { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
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
    await this.notifyUsers(
      createdHoliday,
      'New Holiday Added',
      `A new holiday '${holiday.title}' has been scheduled for ${holiday.holidayDate}.`,
    );

    return createdHoliday;
  }

  async getHolidays(clientId: number, filter: GetHolidaysFilterDto) {
    if (!clientId && filter.companyId) {
      const company = await this.holidayModel.sequelize.models.Company.findByPk(filter.companyId);
      if (company) clientId = (company as any).clientId;
    }
    const where: any = { isActive: true };
    if (clientId) where.clientId = clientId;

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
      holidays.rows = holidays.rows.filter((h) => {
        if (h.holidayCompanies && h.holidayCompanies.length > 0) {
          return h.holidayCompanies.some(
            (hc) => hc.companyId == filter.companyId,
          );
        }
        return true; // Client level holiday (applies to all companies)
      });
      holidays.count = holidays.rows.length;
    }

    return {
      data: holidays.rows,
      meta: {
        total: holidays.count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(holidays.count / limit),
      },
    };
  }

  async getUpcomingHolidays(clientId: number, companyId: number) {
    if (!clientId && companyId) {
      const company = await this.holidayModel.sequelize.models.Company.findByPk(companyId);
      if (company) clientId = (company as any).clientId;
    }
    const today = new Date().toISOString().split('T')[0];
    const where: any = { isActive: true, holidayDate: { [Op.gte]: today } };
    if (clientId) where.clientId = clientId;

    const holidays = await this.holidayModel.findAll({
      where,
      include: [
        {
          model: HolidayCompany,
        },
      ],
      order: [['holidayDate', 'ASC']],
      limit: 5,
    });

    return holidays.filter((h) => {
      if (h.holidayCompanies && h.holidayCompanies.length > 0) {
        return h.holidayCompanies.some((hc) => hc.companyId == companyId);
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
    actor: { userId: number; ipAddress?: string; userAgent?: string },
  ) {
    const holiday = await this.getHolidayById(id, clientId);
    const oldRecord = holiday.toJSON();

    const t = await this.holidayModel.sequelize.transaction();
    try {
      if (dto.title !== undefined) holiday.title = dto.title;
      if (dto.holidayDate !== undefined)
        holiday.holidayDate = dto.holidayDate as any;
      if (dto.holidayType !== undefined) holiday.holidayType = dto.holidayType;
      if (dto.description !== undefined) holiday.description = dto.description;
      if (dto.isOptional !== undefined) holiday.isOptional = dto.isOptional;
      if (dto.isWeeklyOff !== undefined) holiday.isWeeklyOff = dto.isWeeklyOff;
      if (dto.isHalfDay !== undefined) holiday.isHalfDay = dto.isHalfDay;
      if (dto.halfDayStart !== undefined)
        holiday.halfDayStart = dto.halfDayStart;
      if (dto.halfDayEnd !== undefined) holiday.halfDayEnd = dto.halfDayEnd;
      if (dto.isActive !== undefined) holiday.isActive = dto.isActive;

      holiday.updatedBy = actor.userId;
      await holiday.save({ transaction: t });

      if (dto.companyIds !== undefined) {
        await this.holidayCompanyModel.destroy({
          where: { holidayId: id },
          transaction: t,
        });
        if (dto.companyIds.length > 0) {
          const mappings = dto.companyIds.map((cId) => ({
            holidayId: id,
            companyId: cId,
          }));
          await this.holidayCompanyModel.bulkCreate(mappings, {
            transaction: t,
          });
        }
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
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
    actor: { userId: number; ipAddress?: string; userAgent?: string },
  ) {
    const holiday = await this.getHolidayById(id, clientId);
    const oldRecord = holiday.toJSON();

    const t = await this.holidayModel.sequelize.transaction();
    try {
      await this.holidayCompanyModel.destroy({
        where: { holidayId: id },
        transaction: t,
      });
      await holiday.destroy({ transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

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
    // Notifications have been removed from the system.
  }

  private async validateConflict(clientId: number, dto: any, t: any) {
    const existingHolidays = await this.holidayModel.findAll({
      where: { clientId, holidayDate: dto.holidayDate, isActive: true },
      include: [{ model: HolidayCompany }],
      transaction: t,
    });

    const isNewHalfDay = dto.isHalfDay || false;
    const isNewWeeklyOff = dto.isWeeklyOff || false;
    const newCompanyIds = dto.companyIds || [];

    for (const ex of existingHolidays) {
      const exCompanyIds = ex.holidayCompanies?.map((c) => c.companyId) || [];

      let overlap = false;
      if (newCompanyIds.length === 0 || exCompanyIds.length === 0) {
        overlap = true;
      } else {
        overlap = exCompanyIds.some((cId) => newCompanyIds.includes(cId));
      }

      if (overlap) {
        const isExHalfDay = ex.isHalfDay || false;
        const isExWeeklyOff = ex.isWeeklyOff || false;

        if (isNewWeeklyOff !== isExWeeklyOff) {
          continue;
        }

        if ((isNewHalfDay && !isExHalfDay) || (!isNewHalfDay && isExHalfDay)) {
          throw new BadRequestException(
            `Conflict: Cannot mix half day and full holiday on the same date (${dto.holidayDate}).`,
          );
        }

        if (isNewWeeklyOff && isExWeeklyOff) {
          throw new BadRequestException(
            `Conflict: A weekly off already exists on ${dto.holidayDate} for the specified company(s).`,
          );
        }

        if (!isNewWeeklyOff && !isExWeeklyOff) {
          throw new BadRequestException(
            `Conflict: A holiday (${ex.title}) already exists on ${dto.holidayDate} for the specified company(s).`,
          );
        }
      }
    }
  }

  private getOccurrenceInMonth(date: Date): number {
    const day = date.getDay();
    let count = 0;
    for (let d = 1; d <= date.getDate(); d++) {
      const current = new Date(
        date.getFullYear(),
        date.getMonth(),
        d,
        12,
        0,
        0,
      );
      if (current.getDay() === day) {
        count++;
      }
    }
    return count;
  }

  async createRecurringHolidays(
    clientId: number,
    dto: CreateRecurringHolidayDto,
    actor: any,
  ) {
    const dates: string[] = [];

    const sParts = dto.startDate.split('-').map(Number);
    const eParts = dto.endDate.split('-').map(Number);
    const start = new Date(sParts[0], sParts[1] - 1, sParts[2], 12, 0, 0);
    const end = new Date(eParts[0], eParts[1] - 1, eParts[2], 12, 0, 0);

    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dto.weekdays.includes(dayOfWeek)) {
        const occurrence = this.getOccurrenceInMonth(current);
        if (dto.occurrences.includes(occurrence)) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          dates.push(`${year}-${month}-${day}`);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) {
      throw new BadRequestException(
        'No matching dates found for the given recurrence rules.',
      );
    }

    const t = await this.holidayModel.sequelize.transaction();
    const createdHolidays: Holiday[] = [];
    try {
      for (const dateStr of dates) {
        const singleDto = { ...dto, holidayDate: dateStr };
        await this.validateConflict(clientId, singleDto, t);

        const holiday = await this.holidayModel.create(
          {
            clientId,
            title: dto.title,
            holidayDate: dateStr as any,
            holidayType: dto.holidayType,
            description: dto.description || null,
            isOptional: dto.isOptional || false,
            isWeeklyOff: dto.isWeeklyOff || false,
            isHalfDay: dto.isHalfDay || false,
            halfDayStart: dto.halfDayStart || null,
            halfDayEnd: dto.halfDayEnd || null,
            createdBy: actor.userId,
          },
          { transaction: t },
        );

        if (dto.companyIds && dto.companyIds.length > 0) {
          const mappings = dto.companyIds.map((cId) => ({
            holidayId: holiday.id,
            companyId: cId,
          }));
          await this.holidayCompanyModel.bulkCreate(mappings, {
            transaction: t,
          });
        }

        createdHolidays.push(holiday);
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        'Error creating recurring holidays: ' + err.message,
      );
    }

    for (const h of createdHolidays) {
      const createdHoliday = await this.getHolidayById(h.id, clientId);
      await this.auditService.writeDiffLog({
        clientId,
        companyId: null,
        userId: actor.userId,
        entityType: 'Holiday',
        entityId: h.id,
        action: 'CREATE',
        newRecord: createdHoliday,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      await this.notifyUsers(
        createdHoliday,
        'New Holiday Added',
        `A new holiday '${h.title}' has been scheduled for ${h.holidayDate}.`,
      );
    }

    return {
      message: `Successfully created ${createdHolidays.length} recurring holidays.`,
    };
  }
}
