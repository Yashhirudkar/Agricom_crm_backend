import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PartnerFollowUp } from '../../masters/partner/partner-followup.model';
import { Partner } from '../../masters/partner/partner.model';
import { Notification } from '../../notifications/models/notification.model';
import { NotificationsService, NotificationType } from '../../notifications/services/notifications.service';

@Injectable()
export class FollowUpNotificationService {
  private readonly logger = new Logger(FollowUpNotificationService.name);

  constructor(
    @InjectModel(PartnerFollowUp)
    private readonly partnerFollowUpModel: typeof PartnerFollowUp,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
    private readonly notificationsService: NotificationsService,
  ) {}

  async checkAndSendUserReminders(userId: number, companyId: number): Promise<void> {
    if (!userId || !companyId) {
      this.logger.warn(`Skipping reminders check: userId (${userId}) or companyId (${companyId}) is missing`);
      return;
    }

    try {
      // Resolve today's date bounds in 'Asia/Kolkata' timezone
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
      const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

      // Find all pending follow-ups due today for this user and workspace
      const followUps = await this.partnerFollowUpModel.findAll({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.between]: [startOfToday, endOfToday] },
        },
        include: [{ model: this.partnerModel, attributes: ['id', 'entityName'] }],
      });

      if (followUps.length === 0) {
        return;
      }

      this.logger.log(`Found ${followUps.length} pending follow-ups for user ${userId} today. Processing notifications...`);

      for (const followUp of followUps) {
        // Query the notifications table to check if a reminder for this followup was already created for the user
        const existingNotification = await this.notificationModel.findOne({
          where: {
            userId,
            type: 'FOLLOW_UP',
            referenceType: 'partner_followup',
            referenceId: followUp.id,
          },
        });

        // Skip sending reminder if it has already been generated
        if (existingNotification) {
          continue;
        }

        const partnerName = followUp.partner?.entityName || 'Partner';
        const title = `Pending Follow-up: ${partnerName}`;
        const message = `You have a scheduled ${followUp.communicationType} follow-up with ${partnerName} today.`;

        await this.notificationsService.createNotification({
          recipients: [userId],
          type: NotificationType.FOLLOW_UP,
          referenceType: 'partner_followup',
          referenceId: followUp.id,
          title,
          payload: {
            followUpId: followUp.id,
            partnerName,
            dueDate: followUp.nextFollowupDate,
            communicationType: followUp.communicationType,
            buyerRemark: followUp.buyerRemark,
            ourResponse: followUp.ourResponse,
            url: `/masters/partners`,
            message,
            icon: 'calendar',
          },
          category: 'REMINDER',
        });

        this.logger.log(`Dispatched follow-up notification for user ${userId} and followUpId ${followUp.id}`);
      }
    } catch (err) {
      this.logger.error(`Error in checkAndSendUserReminders for user ${userId}:`, err);
    }
  }
}
