import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { PartnerFollowUp } from './partner-followup.model';
import { CreatePartnerFollowUpDto } from './dto/create-partner-followup.dto';
import { UpdatePartnerFollowUpDto } from './dto/update-partner-followup.dto';
import { AuditService } from '../../audit/services/audit.service';
import { FollowUpNotificationService } from '../../follow-up-management/services/follow-up-notification.service';
import { User } from '../../users/models/user.model';
import { Role } from '../../rbac/models/role.model';
import { transformFollowUpCreator, COMPLETED_STATUSES } from '../../follow-up-management/utils/follow-up.utils';

@Injectable()
export class PartnerFollowUpService {
  constructor(
    @InjectModel(PartnerFollowUp)
    private readonly partnerFollowUpModel: typeof PartnerFollowUp,
    private readonly auditService: AuditService,
    private readonly sequelize: Sequelize,
    private readonly followUpNotificationService: FollowUpNotificationService,
  ) {}

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

  async create(dto: CreatePartnerFollowUpDto, user: any): Promise<PartnerFollowUp> {
    return this.sequelize.transaction(async (transaction) => {
      const payload: any = { ...dto };
      const enquiryId = payload.enquiryId || (payload.entityType === 'enquiry' ? payload.entityId : null);
      delete payload.enquiryId;

      if (payload.followupDate) payload.followupDate = new Date(payload.followupDate);
      if (payload.nextFollowupDate) payload.nextFollowupDate = new Date(payload.nextFollowupDate);

      const workspaceId = user.companyId || null;

      // 1. UPDATE: Mark matching previous active pending reminders as Completed
      await this.partnerFollowUpModel.update(
        { status: 'Completed' },
        {
          where: {
            partnerId: dto.partnerId,
            workspaceId,
            isActive: true,
            entityType: dto.entityType || null,
            entityId: dto.entityId || null,
            nextFollowupDate: { [Op.ne]: null },
            status: { [Op.notIn]: [...COMPLETED_STATUSES, 'Cancelled'] },
          },
          transaction,
        }
      );

      // 2. INSERT: Create new timeline record
      const followUp = await this.partnerFollowUpModel.create(
        {
          ...payload,
          workspaceId,
          createdBy: user.userId,
        },
        { transaction }
      );

      return followUp;
    }).then(async (followUp) => {
      // 3. Post-commit side-effects
      const enquiryId = dto.enquiryId || (dto.entityType === 'enquiry' ? dto.entityId : null);
      if (enquiryId && dto.status) {
        await this.syncEnquiryStatus(enquiryId.toString(), dto.status);
      }

      if (followUp.workspaceId && followUp.createdBy) {
        await this.followUpNotificationService.checkAndSendUserReminders(followUp.createdBy, followUp.workspaceId);
      }

      return followUp;
    });
  }

  async findAll(partnerId: number, entityType?: string, entityId?: number): Promise<any[]> {
    const where: any = { partnerId, isActive: true };
    // Omit entityType and entityId filters to unify the conversation history under one partner
    
    const rows = await this.partnerFollowUpModel.findAll({
      where,
      order: [['createdAt', 'ASC']],
      include: [
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
    });

    return rows.map((row) => transformFollowUpCreator(row));
  }

  async findOne(id: number): Promise<PartnerFollowUp> {
    const followUp = await this.partnerFollowUpModel.findOne({
      where: { id, isActive: true },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');
    return followUp;
  }

  async update(id: number, dto: UpdatePartnerFollowUpDto, user: any): Promise<PartnerFollowUp> {
    const followUp = await this.findOne(id);
    
    const payload: any = { ...dto };
    const enquiryId = payload.enquiryId || (payload.entityType === 'enquiry' ? payload.entityId : null);
    delete payload.enquiryId;

    if (payload.followupDate) payload.followupDate = new Date(payload.followupDate);
    if (payload.nextFollowupDate) payload.nextFollowupDate = new Date(payload.nextFollowupDate);

    await followUp.update(payload);

    if (enquiryId && dto.status) {
      await this.syncEnquiryStatus(enquiryId, dto.status);
    }

    if (followUp.workspaceId && followUp.createdBy) {
      // Delete any existing notification for this follow-up so it gets recreated with fresh details
      await this.followUpNotificationService.deleteNotificationForFollowUp(followUp.id);
      await this.followUpNotificationService.checkAndSendUserReminders(followUp.createdBy, followUp.workspaceId);
    }

    return followUp;
  }

  async remove(id: number, user: any): Promise<void> {
    const followUp = await this.findOne(id);
    await followUp.update({ isActive: false });
  }
}

