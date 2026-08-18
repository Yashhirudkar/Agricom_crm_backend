/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PartnerFollowUp } from '../../masters/partner/partner-followup.model';
import { Partner } from '../../masters/partner/partner.model';
import { QueryFollowUpDto, FollowUpFilter } from '../dto/query-followup.dto';
import { buildPagination } from '../../masters/common/pagination.helper';
import { buildPaginatedResponse } from '../../masters/common/response.helper';
import { RescheduleFollowUpDto } from '../dto/reschedule-followup.dto';
import { CompleteFollowUpDto } from '../dto/complete-followup.dto';
import { FollowUpNotificationService } from './follow-up-notification.service';
import { User } from '../../users/models/user.model';
import { Role } from '../../rbac/models/role.model';
import {
  transformFollowUpCreator,
  FOLLOW_UP_REMINDER_PRIORITY,
  COMPLETED_STATUSES,
} from '../utils/follow-up.utils';

@Injectable()
export class FollowUpManagementService {
  private readonly logger = new Logger('FollowUpManagementService');

  constructor(
    @InjectModel(PartnerFollowUp)
    private readonly partnerFollowUpModel: typeof PartnerFollowUp,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    private readonly sequelize: Sequelize,
    private readonly followUpNotificationService: FollowUpNotificationService,
  ) {}

  private getDateBoundaries() {
    // Resolve dates in 'Asia/Kolkata' timezone
    const todayStr = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    }); // YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    }); // YYYY-MM-DD

    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);
    const startOfTomorrow = new Date(`${tomorrowStr}T00:00:00.000Z`);
    const endOfTomorrow = new Date(`${tomorrowStr}T23:59:59.999Z`);

    return {
      todayStr,
      tomorrowStr,
      startOfToday,
      endOfToday,
      startOfTomorrow,
      endOfTomorrow,
    };
  }

  async getDashboardStats(
    companyId: number,
    userId: number,
    userType: string,
    userPermissions: Set<string>,
  ) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } =
      this.getDateBoundaries();

    const hasViewAll = this.hasViewAll(userType, userPermissions);
    const baseWhere = this.applyOwnershipScope(
      {
        workspaceId: companyId,
        isActive: true,
      },
      userId,
      hasViewAll,
    );

    // Query stats in a single pass of optimized parallel database queries using counts
    const [
      todayCount,
      tomorrowCount,
      overdueCount,
      upcomingCount,
      completedToday,
      pendingTotal,
    ] = await Promise.all([
      // 1. Today Pending
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: 'Pending',
          nextFollowupDate: { [Op.between]: [startOfToday, endOfToday] },
        },
      }),
      // 2. Tomorrow Pending
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: 'Pending',
          nextFollowupDate: { [Op.between]: [startOfTomorrow, endOfTomorrow] },
        },
      }),
      // 3. Overdue Pending (due before today)
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: 'Pending',
          nextFollowupDate: { [Op.lt]: startOfToday },
        },
      }),
      // 4. Upcoming Pending (due after today)
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: 'Pending',
          nextFollowupDate: { [Op.gt]: endOfToday },
        },
      }),
      // 5. Completed Today (any completed status updated today)
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: { [Op.in]: COMPLETED_STATUSES },
          updatedAt: { [Op.between]: [startOfToday, endOfToday] },
        },
      }),
      // 6. Total Pending
      this.partnerFollowUpModel.count({
        where: {
          ...baseWhere,
          status: 'Pending',
        },
      }),
    ]);

    return {
      todayCount,
      tomorrowCount,
      overdueCount,
      upcomingCount,
      completedToday,
      pendingTotal,
    };
  }

  async getDashboardList(
    companyId: number,
    userId: number,
    dto: QueryFollowUpDto,
    userType: string,
    userPermissions: Set<string>,
  ) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } =
      this.getDateBoundaries();
    const {
      filter,
      search,
      status,
      priority,
      communicationType,
      startDate,
      endDate,
      page,
      limit,
    } = dto;

    const { limit: finalLimit, offset } = buildPagination(page, limit);

    // Enforce workspace-level tenant isolation and apply ownership scope
    const hasViewAll = this.hasViewAll(userType, userPermissions);
    const whereClause = this.applyOwnershipScope(
      {
        workspaceId: companyId,
        isActive: true,
      },
      userId,
      hasViewAll,
    );

    // Apply Filter Types
    if (filter) {
      if (filter === FollowUpFilter.TODAY) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = {
          [Op.between]: [startOfToday, endOfToday],
        };
      } else if (filter === FollowUpFilter.TOMORROW) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = {
          [Op.between]: [startOfTomorrow, endOfTomorrow],
        };
      } else if (filter === FollowUpFilter.OVERDUE) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = { [Op.lt]: startOfToday };
      } else if (filter === FollowUpFilter.UPCOMING) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = { [Op.gt]: endOfToday };
      }
    }

    // Apply specific status, priority, or comm channel filter
    if (status) {
      whereClause.status = status;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (communicationType) {
      whereClause.communicationType = communicationType;
    }

    // Apply Date Range Filter on nextFollowupDate
    if (startDate || endDate) {
      const dateRange: any = {};
      if (startDate) {
        dateRange[Op.gte] = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        dateRange[Op.lte] = new Date(`${endDate}T23:59:59.999Z`);
      }
      whereClause.nextFollowupDate = {
        ...(whereClause.nextFollowupDate || {}),
        ...dateRange,
      };
    }

    // Apply search query
    if (search) {
      const searchLike = `%${search}%`;
      whereClause[Op.or] = [
        { buyerRemark: { [Op.iLike]: searchLike } },
        { ourResponse: { [Op.iLike]: searchLike } },
        { communicationType: { [Op.iLike]: searchLike } },
        { status: { [Op.iLike]: searchLike } },
        { priority: { [Op.iLike]: searchLike } },
        { '$partner.entity_name$': { [Op.iLike]: searchLike } },
      ];
    }

    // Query database with pagination and optimized joins (eager load Partner and User/Creator)
    const { rows, count } = await this.partnerFollowUpModel.findAndCountAll({
      where: whereClause,
      limit: finalLimit,
      offset,
      order: [
        ['nextFollowupDate', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      include: [
        {
          model: this.partnerModel,
          attributes: ['id', 'entityName', 'country', 'partnerRoleId'],
          required: true,
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'avatarUrl'],
          required: false,
          include: [
            {
              model: Role,
              attributes: ['name'],
              through: { attributes: [] },
              required: false,
            },
          ],
        },
      ],
      distinct: true,
    });

    const transformedRows = rows.map((row) => transformFollowUpCreator(row));
    return buildPaginatedResponse(
      transformedRows,
      count,
      page || 1,
      finalLimit,
    );
  }

  async getHeaderDrawer(
    companyId: number,
    userId: number,
    userType: string,
    userPermissions: Set<string>,
  ) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } =
      this.getDateBoundaries();

    // Fetch lists and counts needed for the header drawer in optimized queries
    const includeCreator = [
      { model: this.partnerModel, attributes: ['id', 'entityName'] },
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'name', 'avatarUrl'],
        required: false,
        include: [
          {
            model: Role,
            attributes: ['name'],
            through: { attributes: [] },
            required: false,
          },
        ],
      },
    ];

    const hasViewAll = this.hasViewAll(userType, userPermissions);
    const baseWhere = this.applyOwnershipScope(
      {
        workspaceId: companyId,
        isActive: true,
      },
      userId,
      hasViewAll,
    );

    const [todayList, overdueList, tomorrowList, recentList, stats] =
      await Promise.all([
        // 1. Today's Pending Follow-ups (first 10)
        this.partnerFollowUpModel.findAll({
          where: {
            ...baseWhere,
            status: 'Pending',
            nextFollowupDate: { [Op.between]: [startOfToday, endOfToday] },
          },
          include: includeCreator,
          order: [['nextFollowupDate', 'ASC']],
          limit: 10,
        }),
        // 2. Overdue Pending Follow-ups (first 10)
        this.partnerFollowUpModel.findAll({
          where: {
            ...baseWhere,
            status: 'Pending',
            nextFollowupDate: { [Op.lt]: startOfToday },
          },
          include: includeCreator,
          order: [['nextFollowupDate', 'ASC']],
          limit: 10,
        }),
        // 3. Tomorrow's Pending Follow-ups (first 10)
        this.partnerFollowUpModel.findAll({
          where: {
            ...baseWhere,
            status: 'Pending',
            nextFollowupDate: {
              [Op.between]: [startOfTomorrow, endOfTomorrow],
            },
          },
          include: includeCreator,
          order: [['nextFollowupDate', 'ASC']],
          limit: 10,
        }),
        // 4. Recently Logged Interactions (last 10)
        this.partnerFollowUpModel.findAll({
          where: {
            ...baseWhere,
          },
          include: includeCreator,
          order: [['updatedAt', 'DESC']],
          limit: 10,
        }),
        // 5. Aggregate stats
        this.getDashboardStats(companyId, userId, userType, userPermissions),
      ]);

    return {
      today: todayList.map((row) => transformFollowUpCreator(row)),
      overdue: overdueList.map((row) => transformFollowUpCreator(row)),
      tomorrow: tomorrowList.map((row) => transformFollowUpCreator(row)),
      recent: recentList.map((row) => transformFollowUpCreator(row)),
      stats,
    };
  }

  async completeFollowUp(
    id: number,
    companyId: number,
    userId: number,
    dto: CompleteFollowUpDto,
    userType: string,
    userPermissions: Set<string>,
  ) {
    const hasUpdateAll = this.hasUpdateAll(userType, userPermissions);
    const whereClause = this.applyWriteOwnershipScope(
      {
        id,
        workspaceId: companyId,
        isActive: true,
      },
      userId,
      hasUpdateAll,
    );

    const followUp = await this.partnerFollowUpModel.findOne({
      where: whereClause,
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found or access denied');
    }

    // Update status and response dynamically based on DTO values
    followUp.status = dto.status;
    if (dto.ourResponse) {
      followUp.ourResponse = dto.ourResponse;
    }
    await followUp.save();

    // Trigger linked enquiry status sync if relevant
    const enquiryId =
      (followUp as any).enquiryId ||
      (followUp.entityType === 'enquiry' ? followUp.entityId : null);
    if (enquiryId) {
      await this.syncEnquiryStatus(String(enquiryId), dto.status);
    }

    return followUp;
  }

  async rescheduleFollowUp(
    id: number,
    companyId: number,
    userId: number,
    dto: RescheduleFollowUpDto,
    userType: string,
    userPermissions: Set<string>,
  ) {
    const hasUpdateAll = this.hasUpdateAll(userType, userPermissions);
    const whereClause = this.applyWriteOwnershipScope(
      {
        id,
        workspaceId: companyId,
        isActive: true,
      },
      userId,
      hasUpdateAll,
    );

    const followUp = await this.partnerFollowUpModel.findOne({
      where: whereClause,
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found or access denied');
    }

    followUp.nextFollowupDate = new Date(dto.nextFollowupDate);
    followUp.status = 'Pending';
    if (dto.ourResponse) {
      followUp.ourResponse = dto.ourResponse;
    }
    await followUp.save();

    // Sync enquiry status if relevant
    const enquiryId =
      (followUp as any).enquiryId ||
      (followUp.entityType === 'enquiry' ? followUp.entityId : null);
    if (enquiryId) {
      await this.syncEnquiryStatus(String(enquiryId), 'Pending');
    }

    // Delete any existing notification for this follow-up so it gets recreated with fresh details
    await this.followUpNotificationService.deleteNotificationForFollowUp(
      followUp.id,
    );

    // Trigger reminder check to send notification immediately if scheduled for today
    const reminderOwner = followUp.createdBy ?? userId;
    await this.followUpNotificationService.checkAndSendUserReminders(
      reminderOwner,
      companyId,
    );

    return followUp;
  }

  private async syncEnquiryStatus(enquiryId: string, followUpStatus: string) {
    if (!enquiryId) return;
    const EnquiryModel = this.sequelize.models.Enquiry;
    if (!EnquiryModel) return;

    let newStatus = 'PENDING';
    if (followUpStatus === 'Waiting Response') {
      newStatus = 'WAITING_RESPONSE';
    } else if (
      followUpStatus === 'Confirmed' ||
      followUpStatus === 'Deal Finalized'
    ) {
      newStatus = 'CONFIRMED';
    } else if (followUpStatus === 'Closed') {
      newStatus = 'CLOSED';
    }

    await EnquiryModel.update(
      { status: newStatus },
      { where: { id: enquiryId } },
    );
  }

  async getMarqueeReminders(
    companyId: number,
    userId: number,
    userPermissions: Set<string>,
    userType: string,
  ) {
    const { startOfToday, startOfTomorrow, endOfTomorrow } =
      this.getDateBoundaries();

    // Check hasViewAll permission to show all or scope to createdBy: userId
    const hasViewAll = this.hasViewAll(userType, userPermissions);

    const where: any = {
      workspaceId: companyId,
      isActive: true,
      status: {
        [Op.notIn]: [...COMPLETED_STATUSES, 'Cancelled'],
      },
      [Op.or]: [
        {
          nextFollowupDate: { [Op.between]: [startOfTomorrow, endOfTomorrow] },
        },
        { nextFollowupDate: { [Op.lt]: startOfToday } },
      ],
    };

    if (!hasViewAll) {
      where.createdBy = userId;
    }

    const rows = await this.partnerFollowUpModel.findAll({
      where,
      include: [
        {
          model: this.partnerModel,
          attributes: ['id', 'entityName'],
          required: false,
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['nextFollowupDate', 'ASC']],
    });

    return rows.map((item) => {
      const isOverdue =
        new Date(item.nextFollowupDate).getTime() < startOfToday.getTime();
      return {
        id: item.id,
        buyerName: item.partner?.entityName || 'Unknown Buyer',
        followUpDate: item.nextFollowupDate,
        priority: isOverdue
          ? FOLLOW_UP_REMINDER_PRIORITY.OVERDUE
          : FOLLOW_UP_REMINDER_PRIORITY.TOMORROW,
        createdByName: item.creator?.name || 'Unknown User',
        communicationType: item.communicationType || null,
      };
    });
  }

  private hasViewAll(userType: string, permissions: Set<string>): boolean {
    return (
      userType === 'super_admin' ||
      userType === 'client_admin' ||
      permissions.has('follow_up:view') ||
      permissions.has('follow_up:read') ||
      permissions.has('follow_up:view_all') ||
      permissions.has('follow_up:read_all')
    );
  }

  private hasUpdateAll(userType: string, permissions: Set<string>): boolean {
    return (
      userType === 'super_admin' ||
      userType === 'client_admin' ||
      permissions.has('follow_up:update') ||
      permissions.has('follow_up:edit') ||
      permissions.has('follow_up:update_all')
    );
  }

  private applyOwnershipScope(
    whereClause: any,
    userId: number,
    hasViewAll: boolean,
  ): any {
    return hasViewAll
      ? { ...whereClause }
      : {
          ...whereClause,
          createdBy: userId,
        };
  }

  private applyWriteOwnershipScope(
    whereClause: any,
    userId: number,
    hasUpdateAll: boolean,
  ): any {
    return hasUpdateAll
      ? { ...whereClause }
      : {
          ...whereClause,
          createdBy: userId,
        };
  }
}
