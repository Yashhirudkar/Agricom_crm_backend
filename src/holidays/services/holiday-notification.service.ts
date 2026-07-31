import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Holiday } from '../models/holiday.model';
import { HolidayCompany } from '../models/holiday-company.model';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';
import { Op } from 'sequelize';

@Injectable()
export class HolidayNotificationService {
  private readonly logger = new Logger(HolidayNotificationService.name);

  constructor(
    @InjectModel(Holiday)
    private readonly holidayModel: typeof Holiday,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Run at 8:00 AM daily
  @Cron('0 8 * * *')
  async notifyHolidays() {
    this.logger.log('Starting daily holiday notification checks...');
    try {
      // Determine today and tomorrow dates in system/local format
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      // Fetch active holidays for today or tomorrow
      const holidays = await this.holidayModel.findAll({
        where: {
          holidayDate: { [Op.in]: [todayStr, tomorrowStr] },
          isActive: true,
        },
        include: [{ model: HolidayCompany }],
      });

      for (const holiday of holidays) {
        const holidayDateStr = (holiday.holidayDate as any).toString();
        const isToday = holidayDateStr === todayStr;

        let companyIds: number[] = [];
        if (holiday.holidayCompanies && holiday.holidayCompanies.length > 0) {
          companyIds = holiday.holidayCompanies.map((hc) => hc.companyId);
        } else {
          // If no specific company is linked, it's client-wide
          const clientCompanies = await this.holidayModel.sequelize.models.Company.findAll({
            where: { clientId: holiday.clientId, isActive: true },
            attributes: ['id'],
          });
          companyIds = clientCompanies.map((c: any) => c.id);
        }

        if (companyIds.length === 0) continue;

        // Fetch active employees belonging to the affected companies
        const activeEmployees = await this.holidayModel.sequelize.models.Employee.findAll({
          where: {
            companyId: companyIds,
            status: {
              [Op.in]: ['ACTIVE', 'CONFIRMED', 'PROBATION', 'NOTICE_PERIOD', 'ONBOARDING'],
            },
          },
          attributes: ['userId'],
        });

        const userIds = Array.from(
          new Set(activeEmployees.map((e: any) => e.userId).filter(Boolean))
        ) as number[];

        if (userIds.length > 0) {
          const title = isToday ? `🎉 Happy ${holiday.title}!` : `🎉 Tomorrow is ${holiday.title}`;
          const message = isToday ? 'Today is a company holiday.' : 'Office will remain closed tomorrow. Happy Holidays!';

          await this.notificationsService.createNotification({
            recipients: userIds,
            type: NotificationType.HR,
            referenceType: `holiday_${holiday.id}`,
            referenceId: holiday.id,
            title,
            payload: {
              message,
              holidayTitle: holiday.title,
              date: holidayDateStr,
              url: '/holidays',
            },
            category: 'HOLIDAY',
          });

          this.logger.log(
            `Sent holiday notifications for '${holiday.title}' (${holidayDateStr}) to ${userIds.length} users.`
          );
        }
      }
    } catch (err) {
      this.logger.error('Error running daily holiday notifications cron:', err);
    }
  }
}
