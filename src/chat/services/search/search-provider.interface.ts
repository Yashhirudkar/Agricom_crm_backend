import { ChatSearchDto } from '../../dto/search.dto';

export interface SearchResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ISearchProvider {
  searchMessages(
    companyId: number,
    accessibleConversationIds: number[],
    dto: ChatSearchDto,
    userId: number,
  ): Promise<SearchResult<any>>;

  searchConversations(
    companyId: number,
    userId: number,
    query: string,
    limit?: number,
  ): Promise<any[]>;

  searchAttachments(
    companyId: number,
    accessibleConversationIds: number[],
    query?: string,
    mimeType?: string,
    limit?: number,
  ): Promise<any[]>;
}
