import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return null;
    }
    const headerCompanyId = request.headers['x-company-id'] || request.activeCompanyId;
    if (headerCompanyId && !user.companyId) {
      user.companyId = parseInt(headerCompanyId, 10);
    }
    return data ? user[data] : user;
  },
);
