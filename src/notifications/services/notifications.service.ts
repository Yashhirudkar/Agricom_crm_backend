import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Notification } from '../models/notification.model';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
  ) {}

  async createNotification(params: {
    userId: number;
    title: string;
    message: string;
    type?: string;
    entityType?: string;
    entityId?: number;
  }): Promise<Notification> {
    return this.notificationModel.create({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type || 'INFO',
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      isRead: false,
    } as any);
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    return this.notificationModel.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
  }

  async markAsRead(id: number, userId: number): Promise<Notification> {
    const notification = await this.notificationModel.findByPk(id);
    if (!notification) throw new NotFoundException(`Notification #${id} not found`);

    if (notification.userId !== userId) {
      throw new ForbiddenException('You cannot modify this notification');
    }

    notification.isRead = true;
    await notification.save();
    return notification;
  }

  async markAllAsRead(userId: number): Promise<{ message: string }> {
    await this.notificationModel.update(
      { isRead: true },
      { where: { userId, isRead: false } },
    );
    return { message: 'All notifications marked as read' };
  }
}
