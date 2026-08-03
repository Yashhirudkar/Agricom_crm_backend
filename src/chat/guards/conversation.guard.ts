import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Conversation } from '../models/conversation.model';
import { ConversationMember } from '../models/conversation-member.model';

@Injectable()
export class ConversationGuard implements CanActivate {
  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    @InjectModel(ConversationMember)
    private readonly memberModel: typeof ConversationMember,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied. Unauthenticated.');
    }

    // Super Admin bypasses membership constraints but must respect company isolation if x-company-id is provided
    const isSuperAdmin = user.type === 'super_admin';

    // 1. Extract conversationId from parameters (could be 'id' or 'conversationId' in params, query, or body)
    const conversationIdVal =
      request.params.conversationId ||
      request.params.id ||
      request.query.conversationId ||
      request.body.conversationId;

    if (!conversationIdVal) {
      // If no conversationId is supplied in route context, delegate validation to the controller/service itself
      return true;
    }

    const conversationId = parseInt(conversationIdVal, 10);
    if (isNaN(conversationId)) {
      throw new NotFoundException('Invalid conversation ID format.');
    }

    // 2. Load conversation metadata
    const conversation = await this.conversationModel.findByPk(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    // 3. Verify Tenant Isolation (clientId)
    if (user.clientId !== null && conversation.clientId !== null && conversation.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant data access is not allowed.');
    }

    // 4. Verify Company/Workspace Isolation
    const activeCompanyId = request.headers['x-company-id'] || request.activeCompanyId;
    if (activeCompanyId) {
      const companyId = parseInt(activeCompanyId as string, 10);
      if (conversation.companyId !== null && conversation.companyId !== companyId) {
        throw new ForbiddenException('Conversation does not belong to the selected company workspace.');
      }
    }

    // Keep reference on the request object for controllers/services to reuse
    request.activeConversation = conversation;

    if (isSuperAdmin) {
      return true;
    }

    // 5. Verify Membership inside the target conversation
    const membership = await this.memberModel.findOne({
      where: {
        conversationId,
        userId: user.id || user.userId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation.');
    }

    // Keep membership references on the request context
    request.conversationMembership = membership;

    return true;
  }
}
