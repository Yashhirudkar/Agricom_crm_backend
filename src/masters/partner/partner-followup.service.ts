import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PartnerFollowUp } from './partner-followup.model';
import { CreatePartnerFollowUpDto } from './dto/create-partner-followup.dto';
import { UpdatePartnerFollowUpDto } from './dto/update-partner-followup.dto';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class PartnerFollowUpService {
  constructor(
    @InjectModel(PartnerFollowUp)
    private readonly partnerFollowUpModel: typeof PartnerFollowUp,
    private readonly auditService: AuditService,
    private readonly sequelize: Sequelize,
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
    const payload: any = { ...dto };
    const enquiryId = payload.enquiryId || (payload.entityType === 'enquiry' ? payload.entityId : null);
    delete payload.enquiryId;

    if (payload.followupDate) payload.followupDate = new Date(payload.followupDate);
    if (payload.nextFollowupDate) payload.nextFollowupDate = new Date(payload.nextFollowupDate);

    const followUp = await this.partnerFollowUpModel.create({
      ...payload,
      workspaceId: user.companyId || null,
      createdBy: user.userId,
    });

    if (enquiryId && dto.status) {
      await this.syncEnquiryStatus(enquiryId, dto.status);
    }

    return followUp;
  }

  async findAll(partnerId: number, entityType?: string, entityId?: number): Promise<PartnerFollowUp[]> {
    const where: any = { partnerId, isActive: true };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    return this.partnerFollowUpModel.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });
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
    return followUp;
  }

  async remove(id: number, user: any): Promise<void> {
    const followUp = await this.findOne(id);
    await followUp.update({ isActive: false });
  }
}

