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

const COMPLETED_STATUSES = ['Confirmed', 'Deal Finalized', 'Closed', 'Completed'];

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
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

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

  async getDashboardStats(companyId: number, userId: number) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } = this.getDateBoundaries();

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
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.between]: [startOfToday, endOfToday] },
        },
      }),
      // 2. Tomorrow Pending
      this.partnerFollowUpModel.count({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.between]: [startOfTomorrow, endOfTomorrow] },
        },
      }),
      // 3. Overdue Pending (due before today)
      this.partnerFollowUpModel.count({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.lt]: startOfToday },
        },
      }),
      // 4. Upcoming Pending (due after today)
      this.partnerFollowUpModel.count({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.gt]: endOfToday },
        },
      }),
      // 5. Completed Today (any completed status updated today)
      this.partnerFollowUpModel.count({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: { [Op.in]: COMPLETED_STATUSES },
          isActive: true,
          updatedAt: { [Op.between]: [startOfToday, endOfToday] },
        },
      }),
      // 6. Total Pending
      this.partnerFollowUpModel.count({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
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

  async getDashboardList(companyId: number, userId: number, dto: QueryFollowUpDto) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } = this.getDateBoundaries();
    const { filter, search, status, priority, communicationType, startDate, endDate, page, limit } = dto;

    const { limit: finalLimit, offset } = buildPagination(page, limit);

    // Enforce workspace-level tenant isolation
    const whereClause: any = {
      workspaceId: companyId,
      createdBy: userId, // createdBy acts as record owner
      isActive: true,
    };

    // Apply Filter Types
    if (filter) {
      if (filter === FollowUpFilter.TODAY) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = { [Op.between]: [startOfToday, endOfToday] };
      } else if (filter === FollowUpFilter.TOMORROW) {
        whereClause.status = 'Pending';
        whereClause.nextFollowupDate = { [Op.between]: [startOfTomorrow, endOfTomorrow] };
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

    // Query database with pagination and optimized joins (eager load Partner)
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
      ],
      distinct: true,
    });

    return buildPaginatedResponse(rows, count, page || 1, finalLimit);
  }

  async getHeaderDrawer(companyId: number, userId: number) {
    const { startOfToday, endOfToday, startOfTomorrow, endOfTomorrow } = this.getDateBoundaries();

    // Fetch lists and counts needed for the header drawer in optimized queries
    const [todayList, overdueList, tomorrowList, recentList, stats] = await Promise.all([
      // 1. Today's Pending Follow-ups (first 10)
      this.partnerFollowUpModel.findAll({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.between]: [startOfToday, endOfToday] },
        },
        include: [{ model: this.partnerModel, attributes: ['id', 'entityName'] }],
        order: [['nextFollowupDate', 'ASC']],
        limit: 10,
      }),
      // 2. Overdue Pending Follow-ups (first 10)
      this.partnerFollowUpModel.findAll({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.lt]: startOfToday },
        },
        include: [{ model: this.partnerModel, attributes: ['id', 'entityName'] }],
        order: [['nextFollowupDate', 'ASC']],
        limit: 10,
      }),
      // 3. Tomorrow's Pending Follow-ups (first 10)
      this.partnerFollowUpModel.findAll({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          status: 'Pending',
          isActive: true,
          nextFollowupDate: { [Op.between]: [startOfTomorrow, endOfTomorrow] },
        },
        include: [{ model: this.partnerModel, attributes: ['id', 'entityName'] }],
        order: [['nextFollowupDate', 'ASC']],
        limit: 10,
      }),
      // 4. Recently Logged Interactions (last 10)
      this.partnerFollowUpModel.findAll({
        where: {
          workspaceId: companyId,
          createdBy: userId,
          isActive: true,
        },
        include: [{ model: this.partnerModel, attributes: ['id', 'entityName'] }],
        order: [['updatedAt', 'DESC']],
        limit: 10,
      }),
      // 5. Aggregate stats
      this.getDashboardStats(companyId, userId),
    ]);

    return {
      today: todayList,
      overdue: overdueList,
      tomorrow: tomorrowList,
      recent: recentList,
      stats,
    };
  }

  async completeFollowUp(id: number, companyId: number, userId: number, dto: CompleteFollowUpDto) {
    const followUp = await this.partnerFollowUpModel.findOne({
      where: { id, workspaceId: companyId, createdBy: userId, isActive: true },
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
    const enquiryId = (followUp as any).enquiryId || (followUp.entityType === 'enquiry' ? followUp.entityId : null);
    if (enquiryId) {
      await this.syncEnquiryStatus(enquiryId.toString(), dto.status);
    }

    return followUp;
  }

  async rescheduleFollowUp(id: number, companyId: number, userId: number, dto: RescheduleFollowUpDto) {
    const followUp = await this.partnerFollowUpModel.findOne({
      where: { id, workspaceId: companyId, createdBy: userId, isActive: true },
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
    const enquiryId = (followUp as any).enquiryId || (followUp.entityType === 'enquiry' ? followUp.entityId : null);
    if (enquiryId) {
      await this.syncEnquiryStatus(enquiryId.toString(), 'Pending');
    }

    return followUp;
  }

  private async syncEnquiryStatus(enquiryId: string, followUpStatus: string) {
    if (!enquiryId) return;
    const EnquiryModel = this.sequelize.models.Enquiry;
    if (!EnquiryModel) return;

    let newStatus = 'PENDING';
    if (followUpStatus === 'Waiting Response') {
      newStatus = 'WAITING_RESPONSE';
    } else if (followUpStatus === 'Confirmed' || followUpStatus === 'Deal Finalized') {
      newStatus = 'CONFIRMED';
    } else if (followUpStatus === 'Closed') {
      newStatus = 'CLOSED';
    }

    await EnquiryModel.update(
      { status: newStatus },
      { where: { id: enquiryId } }
    );
  }
}
