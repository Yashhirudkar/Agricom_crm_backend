import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Conversation } from '../models/conversation.model';
import { PolicyService } from '../services/policy.service';

@Injectable()
export class ConversationGuard implements CanActivate {
  constructor(
    @InjectModel(Conversation)
    private readonly conversationModel: typeof Conversation,
    private readonly policyService: PolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied. Unauthenticated.');
    }

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

    // 3. Verify Tenant Isolation (clientId) (Super Admins bypass)
    if (user.type !== 'super_admin' && user.clientId !== null && conversation.clientId !== null && conversation.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant data access is not allowed.');
    }

    // 4. Verify Company/Workspace Isolation (Super Admins bypass)
    const activeCompanyId = request.headers['x-company-id'] || request.activeCompanyId;
    if (user.type !== 'super_admin' && activeCompanyId) {
      const companyId = parseInt(activeCompanyId as string, 10);
      if (conversation.companyId !== null && conversation.companyId !== companyId) {
        throw new ForbiddenException('Conversation does not belong to the selected company workspace.');
      }
    }

    // Keep reference on the request object for controllers/services to reuse
    request.activeConversation = conversation;

    // 5. Verify access using Policy Engine
    const activeCompany = activeCompanyId ? parseInt(activeCompanyId as string, 10) : (conversation.companyId || 1);
    const { hasAccess, member } = await this.policyService.checkConversationAccess(
      conversationId,
      user.userId || user.id,
      activeCompany,
      user.type || '',
    );

    if (!hasAccess) {
      const security = this.policyService.resolveSecurityFlags(conversation);
      if (security.hideApi || conversation.visibility === 'HIDDEN') {
        throw new NotFoundException('Conversation not found.');
      }
      throw new ForbiddenException('You do not have permission to view this conversation.');
    }

    // Keep membership reference on the request context
    request.conversationMembership = member;

    return true;
  }
}
