import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SalesOnlyGuard } from './sales-only.guard';

describe('SalesOnlyGuard', () => {
  let guard: SalesOnlyGuard;
  let mockUserCompanyModel: any;
  let mockUserRoleModel: any;

  beforeEach(() => {
    mockUserCompanyModel = {
      findOne: jest.fn(),
    };
    mockUserRoleModel = {
      findOne: jest.fn(),
    };
    guard = new SalesOnlyGuard(mockUserCompanyModel, mockUserRoleModel);
  });

  const createMockContext = (user: any, headers: any = {}) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers,
        }),
      }),
    } as ExecutionContext;
  };

  it('should block super_admin', async () => {
    const context = createMockContext({ id: 1, type: 'super_admin' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should block client_admin', async () => {
    const context = createMockContext({ id: 2, type: 'client_admin' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should block user with Logistics role', async () => {
    const context = createMockContext({ id: 8, type: 'user' }, { 'x-company-id': '1' });
    mockUserCompanyModel.findOne.mockResolvedValue({
      role: { name: 'Logistics' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should allow user with Sales role', async () => {
    const context = createMockContext({ id: 5, type: 'user' }, { 'x-company-id': '1' });
    mockUserCompanyModel.findOne.mockResolvedValue({
      role: { name: 'Sales' },
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});

