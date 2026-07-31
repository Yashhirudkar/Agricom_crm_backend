import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Notification } from '../models/notification.model';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import { User } from '../../users/models/user.model';
import { UserPreference } from '../../users/models/user-preference.model';
import { Role } from '../../rbac/models/role.model';
import { UserCompany } from '../../users/models/user-company.model';
import { Op } from 'sequelize';

export enum NotificationType {
  TASK = 'TASK',
  ENQUIRY = 'ENQUIRY',
  CONTRACT = 'CONTRACT',
  FOLLOW_UP = 'FOLLOW_UP',
  CHAT = 'CHAT',
  HR = 'HR',
}

export interface CreateNotificationDto {
  recipients: number[];
  type: NotificationType;
  referenceType: string;
  referenceId: number;
  title: string;
  payload: any;
  category?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(UserPreference)
    private readonly userPreferenceModel: typeof UserPreference,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createNotification(dto: CreateNotificationDto, currentUserId?: number) {
    // 1. De-duplicate and validate recipients
    let validRecipients = Array.from(new Set(dto.recipients)).filter(Boolean);

    // 2. Fetch recipient client associations to copy notifications to organization admins
    if (validRecipients.length > 0) {
      try {
        const recipientsProfiles = await this.userModel.findAll({
          where: { id: validRecipients, isActive: true }
        });
        const clientIds = Array.from(new Set(recipientsProfiles.map(u => u.clientId).filter(Boolean)));

        if (clientIds.length > 0) {
          // Query active users belonging to client workspace
          const adminUsers = await this.userModel.findAll({
            where: {
              clientId: clientIds,
              isActive: true,
            },
            include: [
              {
                model: Role,
                through: { attributes: [] },
                attributes: ['id', 'name'],
                required: false,
              },
              {
                model: UserCompany,
                required: false,
                include: [{ model: Role, attributes: ['id', 'name'] }]
              }
            ]
          });

          // Match admins (by role name 'Admin' / 'Client Admin' or email admin@agricom.com)
          const adminIds = adminUsers
            .filter(u => {
              if (u.email === 'admin@agricom.com') return true;
              if (u.roles?.some(r => ['Admin', 'Client Admin'].includes(r.name))) return true;
              if (u.userCompanies?.some(uc => ['Admin', 'Client Admin'].includes(uc.role?.name))) return true;
              return false;
            })
            .map(u => u.id);

          // Force include default super admin
          const superAdmin = await this.userModel.findOne({ where: { email: 'admin@agricom.com', isActive: true } });
          if (superAdmin) {
            adminIds.push(superAdmin.id);
          }

          const uniqueAdminIds = Array.from(new Set(adminIds));
          // Exclude admins who opted out of copy notifications
          const adminPrefs = await this.userPreferenceModel.findAll({
            where: { userId: uniqueAdminIds }
          });
          const optedOutAdminIds = new Set(
            adminPrefs.filter(p => p.copyTenantNotifications === false).map(p => p.userId)
          );
          const finalAdminIds = uniqueAdminIds.filter(id => !optedOutAdminIds.has(id));

          validRecipients = Array.from(new Set([...validRecipients, ...finalAdminIds]));
        }
      } catch (err) {
        console.error('[NotificationsService] Error loading client admins:', err);
      }
    }

    // 3. Exclude muted users based on preferences and categories
    try {
      const preferences = await this.userPreferenceModel.findAll({
        where: { userId: validRecipients }
      });
      const mutedUserIds = new Set<number>();
      for (const p of preferences) {
        if (p.pushNotifications === false) {
          mutedUserIds.add(p.userId);
          continue;
        }

        // Determine category dynamically
        const category = dto.category || (
          dto.referenceType?.startsWith('attendance_reminder') ? 'REMINDER' :
          dto.referenceType === 'attendance_conflict' ? 'CONFLICT' :
          dto.referenceType?.startsWith('leave_') ? 'LEAVE' :
          dto.referenceType?.startsWith('holiday_') ? 'HOLIDAY' :
          dto.type === NotificationType.TASK ? 'TASK' : 'SYSTEM'
        );

        if (category === 'REMINDER' && p.attendanceRemindersEnabled === false) {
          mutedUserIds.add(p.userId);
        } else if (category === 'LEAVE' && p.leaveNotificationsEnabled === false) {
          mutedUserIds.add(p.userId);
        } else if (category === 'HOLIDAY' && p.holidayNotificationsEnabled === false) {
          mutedUserIds.add(p.userId);
        }
      }
      validRecipients = validRecipients.filter(id => !mutedUserIds.has(id));
    } catch (err) {
      console.error('[NotificationsService] Error loading user preferences:', err);
    }

    if (validRecipients.length === 0) {
      return [];
    }

    const createdNotifications: Notification[] = [];

    // 4. Save and broadcast each notification
    for (const recipientId of validRecipients) {
      try {
        const category = dto.category || (
          dto.referenceType?.startsWith('attendance_reminder') ? 'REMINDER' :
          dto.referenceType === 'attendance_conflict' ? 'CONFLICT' :
          dto.referenceType?.startsWith('leave_') ? 'LEAVE' :
          dto.referenceType?.startsWith('holiday_') ? 'HOLIDAY' :
          dto.type === NotificationType.TASK ? 'TASK' : 'SYSTEM'
        );

        const notif = await this.notificationModel.create({
          userId: recipientId,
          type: dto.type,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          title: dto.title,
          payload: dto.payload,
          isRead: false,
          category,
        });

        createdNotifications.push(notif);

        // Emit to room user-${recipientId}
        this.gateway.emitToUser(recipientId, 'notification', notif.toJSON());
      } catch (err) {
        console.error(`[NotificationsService] Failed to create or emit notification for user ${recipientId}:`, err);
      }
    }

    return createdNotifications;
  }

  async findAll(userId: number): Promise<Notification[]> {
    return this.notificationModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
  }

  async markAsRead(id: number, userId: number): Promise<Notification> {
    const notif = await this.notificationModel.findOne({
      where: { id, userId },
    });

    if (!notif) {
      throw new NotFoundException('Notification not found');
    }

    notif.isRead = true;
    await notif.save();
    return notif;
  }

  async markAllRead(userId: number): Promise<{ success: boolean; count: number }> {
    const [affectedCount] = await this.notificationModel.update(
      { isRead: true },
      {
        where: { userId, isRead: false },
      },
    );

    return { success: true, count: affectedCount };
  }

  async findAllAdmin(
    clientId?: number,
    page: number = 1,
    limit: number = 15,
    search?: string,
    type?: string,
    status?: string,
  ): Promise<{ rows: Notification[]; count: number }> {
    const where: any = {};
    if (clientId !== undefined && clientId !== null) {
      where['$user.clientId$'] = clientId;
    }

    if (type && type !== 'ALL') {
      where.type = type;
    }

    if (status && status !== 'ALL') {
      where.isRead = status === 'READ';
    }

    if (search) {
      const searchLike = `%${search}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: searchLike } },
        { '$user.name$': { [Op.iLike]: searchLike } },
        { '$user.email$': { [Op.iLike]: searchLike } },
      ];
    }

    const { rows, count } = await this.notificationModel.findAndCountAll({
      where,
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'email', 'avatarUrl', 'clientId'],
          required: true,
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit,
      limit,
      subQuery: false,
    });

    return { rows, count };
  }

  async findUsersSettings(clientId?: number) {
    const where: any = { isActive: true };
    if (clientId !== undefined && clientId !== null) {
      where.clientId = clientId;
    }
    const users = await this.userModel.findAll({
      where,
      attributes: ['id', 'name', 'email', 'avatarUrl', 'status'],
      order: [['name', 'ASC']],
    });

    const userIds = users.map(u => u.id);
    const preferences = await this.userPreferenceModel.findAll({
      where: { userId: userIds },
    });

    const prefMap = new Map<number, boolean>();
    preferences.forEach(p => {
      prefMap.set(p.userId, p.pushNotifications);
    });

    return users.map(u => {
      const isPushEnabled = prefMap.has(u.id) ? prefMap.get(u.id) : true;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        status: u.status,
        pushNotifications: isPushEnabled,
      };
    });
  }

  async toggleUserMute(userId: number, mute: boolean): Promise<any> {
    let pref = await this.userPreferenceModel.findOne({
      where: { userId },
    });

    if (!pref) {
      pref = await this.userPreferenceModel.create({
        userId,
        pushNotifications: !mute,
        emailNotifications: true,
        twoFactorEnabled: false,
        theme: 'system',
      });
    } else {
      pref.pushNotifications = !mute;
      await pref.save();
    }

    return pref;
  }

  async getCopySetting(userId: number): Promise<boolean> {
    const pref = await this.userPreferenceModel.findOne({
      where: { userId },
    });
    return pref ? pref.copyTenantNotifications !== false : true;
  }

  async setCopySetting(userId: number, enabled: boolean): Promise<any> {
    let pref = await this.userPreferenceModel.findOne({
      where: { userId },
    });

    if (!pref) {
      pref = await this.userPreferenceModel.create({
        userId,
        copyTenantNotifications: enabled,
        pushNotifications: true,
        emailNotifications: true,
        twoFactorEnabled: false,
        theme: 'system',
      });
    } else {
      pref.copyTenantNotifications = enabled;
      await pref.save();
    }

    return pref;
  }
}
