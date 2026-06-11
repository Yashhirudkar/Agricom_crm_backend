import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus, UnauthorizedException, Ip, Headers, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UsersService } from '../../users/services/users.service';
import { ClientsService } from '../../clients/services/clients.service';
import { InjectModel } from '@nestjs/sequelize';
import { UserCompany } from '../../users/models/user-company.model';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.refresh(refreshDto.refreshToken, ip, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    return this.authService.logout(req.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Request() req) {
    const userId = req.user.type === 'user' || req.user.type === 'super_admin' || req.user.type === 'client_admin' ? req.user.userId : null;
    const clientId = req.user.type === 'client_admin' ? req.user.clientId : null;
    return this.authService.logoutAll(userId, clientId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    if (req.user.type === 'client_admin' && !req.user.userId) {
      // Fallback for legacy client admin sessions
      const client = await this.clientsService.findById(req.user.sub);
      if (!client) throw new UnauthorizedException('Client not found');
      return {
        id: client.id,
        name: client.name,
        email: client.email,
        type: 'client_admin',
        isActive: client.isActive,
        workspaces: [],
      };
    }

    const userId = req.user.userId || req.user.sub;
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) throw new UnauthorizedException('User not found');

    // Determine type
    let type: 'super_admin' | 'client_admin' | 'user' = 'user';
    if (user.clientId === null) {
      type = 'super_admin';
    } else {
      const hasClientAdminRole = user.roles?.some((r) => r.name === 'Client Admin');
      if (hasClientAdminRole) {
        type = 'client_admin';
      }
    }

    const workspaces = user.userCompanies?.map((uc) => ({
      id: uc.company?.id,
      name: uc.company?.name,
      role: uc.role ? { id: uc.role.id, name: uc.role.name } : null,
      status: uc.status,
    })) || [];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      type,
      status: user.status,
      clientId: user.clientId,
      lastCompanyId: user.lastCompanyId,
      isActive: user.isActive,
      roles: user.roles?.map((r: any) => ({
        id: r.id,
        name: r.name,
      })) ?? [],
      workspaces,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  async switchWorkspace(@Request() req, @Body() body: { companyId: number }) {
    const userId = req.user.userId || req.user.sub;
    const { companyId } = body;

    if (!companyId) {
      throw new ForbiddenException('companyId is required');
    }

    // Verify user belongs to the requested company
    const membership = await this.userCompanyModel.findOne({
      where: { userId, companyId, status: 'Active' },
    });

    if (!membership && req.user.type !== 'super_admin') {
      // Client Admins have access to all companies of their client. Let's verify that.
      if (req.user.type === 'client_admin') {
        const fullUser = await this.usersService.findById(userId);
        const targetCompany = await this.userCompanyModel.sequelize!.query(
          `SELECT id FROM "companies" WHERE id = :companyId AND "clientId" = :clientId LIMIT 1;`,
          {
            replacements: { companyId, clientId: fullUser?.clientId },
            type: 'SELECT'
          }
        ) as any[];
        if (targetCompany.length === 0) {
          throw new ForbiddenException('Company does not belong to your client organization');
        }
      } else {
        throw new ForbiddenException('You do not belong to this company workspace');
      }
    }

    // Update user's lastCompanyId
    await this.usersService.updateUser(userId, { lastCompanyId: companyId });

    return {
      success: true,
      lastCompanyId: companyId,
    };
  }
}
