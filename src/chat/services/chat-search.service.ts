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
    dto: ChatSearchDto,
  ) {
    const memberships = await this.memberRepository.findAll({
      where: { userId },
      attributes: ['conversationId'],
    });
    const accessibleConversationIds = memberships.map((m) => m.conversationId);

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
    query: string,
  ) {
    return this.searchProvider.searchConversations(companyId, userId, query);
  }

  /**
   * Search attachments across accessible conversations
   */
  async searchAttachments(
    companyId: number,
    userId: number,
    query?: string,
    mimeType?: string,
  ) {
    const memberships = await this.memberRepository.findAll({
      where: { userId },
      attributes: ['conversationId'],
    });
    const accessibleConversationIds = memberships.map((m) => m.conversationId);

    return this.searchProvider.searchAttachments(
      companyId,
      accessibleConversationIds,
      query,
      mimeType,
    );
  }
}
