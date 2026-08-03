import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ChatPolicy } from '../models/chat-policy.model';

@Injectable()
export class ChatPolicyService {
  private readonly logger = new Logger(ChatPolicyService.name);

  constructor(
    @InjectModel(ChatPolicy)
    private readonly policyRepository: typeof ChatPolicy,
  ) {}

  /**
   * Get or create default chat policy for company
   */
  async getCompanyPolicy(companyId: number): Promise<ChatPolicy> {
    const [policy] = await this.policyRepository.findOrCreate({
      where: { companyId },
      defaults: {
        companyId,
        allowVoice: true,
        allowVideo: true,
        allowGif: true,
        allowPoll: true,
        allowExport: true,
        allowForward: true,
        allowMentionAll: true,
        allowAiAssistant: true,
        maxUploadSize: 104857600,
        retentionDays: 365,
        legalHoldActive: false,
      } as any,
    });
    return policy;
  }

  /**
   * Update chat policy for company
   */
  async updateCompanyPolicy(companyId: number, dto: Partial<ChatPolicy>): Promise<ChatPolicy> {
    const policy = await this.getCompanyPolicy(companyId);
    Object.assign(policy, dto);
    await policy.save();
    return policy;
  }
}
