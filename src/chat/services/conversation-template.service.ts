import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConversationTemplate } from '../models/conversation-template.model';

@Injectable()
export class ConversationTemplateService {
  private readonly logger = new Logger(ConversationTemplateService.name);

  constructor(
    @InjectModel(ConversationTemplate)
    private readonly templateRepository: typeof ConversationTemplate,
  ) {}

  async getTemplates(companyId?: number) {
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
    return this.templateRepository.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });
  }

  async createTemplate(dto: {
    companyId?: number;
    name: string;
    type: string;
    description?: string;
    defaultSettings?: any;
    isAutoProvisioned?: boolean;
  }) {
    return this.templateRepository.create(dto as any);
  }

  async deleteTemplate(id: number) {
    const tpl = await this.templateRepository.findByPk(id);
    if (!tpl) {
      throw new NotFoundException('Template not found');
    }
    await tpl.destroy();
    return { message: 'Template removed' };
  }
}
