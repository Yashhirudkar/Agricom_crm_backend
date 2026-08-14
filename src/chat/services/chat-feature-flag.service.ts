import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ChatFeatureFlag } from '../models/chat-feature-flag.model';

@Injectable()
export class ChatFeatureFlagService {
  private readonly logger = new Logger(ChatFeatureFlagService.name);

  constructor(
    @InjectModel(ChatFeatureFlag)
    private readonly flagRepository: typeof ChatFeatureFlag,
  ) {}

  async isFeatureEnabled(companyId: number, featureKey: string): Promise<boolean> {
    const flag = await this.flagRepository.findOne({
      where: { companyId, featureKey },
    });
    return flag ? flag.isEnabled : true; // default true if not specifically disabled
  }

  async getAllFlags(companyId: number): Promise<ChatFeatureFlag[]> {
    return this.flagRepository.findAll({
      where: { companyId },
    });
  }

  async setFeatureFlag(
    companyId: number,
    featureKey: string,
    isEnabled: boolean,
    description?: string,
  ): Promise<ChatFeatureFlag> {
    const [flag] = await this.flagRepository.findOrCreate({
      where: { companyId, featureKey },
      defaults: { companyId, featureKey, isEnabled, description } as any,
    });

    flag.isEnabled = isEnabled;
    if (description) {
      flag.description = description;
    }
    await flag.save();

    return flag;
  }
}
