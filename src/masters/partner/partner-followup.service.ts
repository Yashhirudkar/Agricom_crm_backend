import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
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
  ) {}

  async create(dto: CreatePartnerFollowUpDto, user: any): Promise<PartnerFollowUp> {
    const payload: any = { ...dto };
    if (payload.followupDate) payload.followupDate = new Date(payload.followupDate);
    if (payload.nextFollowupDate) payload.nextFollowupDate = new Date(payload.nextFollowupDate);

    const followUp = await this.partnerFollowUpModel.create({
      ...payload,
      workspaceId: user.companyId || null,
      createdBy: user.userId,
    });

    return followUp;
  }

  async findAll(partnerId: number): Promise<PartnerFollowUp[]> {
    return this.partnerFollowUpModel.findAll({
      where: { partnerId, isActive: true },
      order: [['followupDate', 'DESC'], ['createdAt', 'DESC']],
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
    if (payload.followupDate) payload.followupDate = new Date(payload.followupDate);
    if (payload.nextFollowupDate) payload.nextFollowupDate = new Date(payload.nextFollowupDate);

    await followUp.update(payload);
    return followUp;
  }

  async remove(id: number, user: any): Promise<void> {
    const followUp = await this.findOne(id);
    await followUp.update({ isActive: false });
  }
}
