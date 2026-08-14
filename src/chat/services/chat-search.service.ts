import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { DatabaseSearchProvider } from './search/database-search.provider';
import { ChatSearchDto } from '../dto/search.dto';
import { ConversationMember } from '../models/conversation-member.model';

@Injectable()
export class ChatSearchService {
  private readonly logger = new Logger(ChatSearchService.name);

  constructor(
    private readonly searchProvider: DatabaseSearchProvider,
    @InjectModel(ConversationMember)
    private readonly memberRepository: typeof ConversationMember,
  ) {}

  /**
   * Search messages with multi-tenant company isolation
   */
  async searchMessages(
    companyId: number,
    userId: number,
    userType: string,
    dto: ChatSearchDto,
  ) {
    const accessibleConversationIds = await this.searchProvider.getAccessibleConversationIds(userId, companyId, userType);

    return this.searchProvider.searchMessages(
      companyId,
      accessibleConversationIds,
      dto,
      userId,
    );
  }

  /**
   * Search channels and conversations
   */
  async searchConversations(
    companyId: number,
    userId: number,
    userType: string,
    query: string,
  ) {
    return this.searchProvider.searchConversations(companyId, userId, userType, query);
  }

  /**
   * Search attachments across accessible conversations
   */
  async searchAttachments(
    companyId: number,
    userId: number,
    userType: string,
    query?: string,
    mimeType?: string,
  ) {
    const accessibleConversationIds = await this.searchProvider.getAccessibleConversationIds(userId, companyId, userType);

    return this.searchProvider.searchAttachments(
      companyId,
      accessibleConversationIds,
      query,
      mimeType,
    );
  }
}
