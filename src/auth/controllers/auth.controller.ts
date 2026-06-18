import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus, UnauthorizedException, Ip, Headers, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { SwitchWorkspaceDto } from '../dto/switch-workspace.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UsersService } from '../../users/services/users.service';
import { ClientsService } from '../../clients/services/clients.service';
import { InjectModel } from '@nestjs/sequelize';
import { UserCompany } from '../../users/models/user-company.model';
import { ProfileService } from '../../profile/services/profile.service';
import { RateLimit } from '../../profile/guards/rate-limit.guard';
import { ChangePasswordDto } from '../../profile/dto/change-password.dto';
import { Put } from '@nestjs/common';
import { SystemService } from '../../system/services/system.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    private readonly profileService: ProfileService,
    private readonly systemService: SystemService,
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

      const allCompanies = await this.userCompanyModel.sequelize!.query(
        `SELECT id, name, status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
        {
          replacements: { clientId: client.id },
          type: 'SELECT'
        }
      ) as any[];

      const workspaces = allCompanies.map(c => ({
        id: c.id,
        name: c.name,
        role: { id: 0, name: 'Client Admin' },
        status: c.status || 'Active',
      }));

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        type: 'client_admin',
        isActive: client.isActive,
        workspaces,
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

    let workspaces = [];
    let permissions: string[] = [];

    const activeCompanyId = req.headers['x-company-id'] || user.lastCompanyId;

    if (type === 'client_admin') {
      const allCompanies = await this.userCompanyModel.sequelize!.query(
        `SELECT id, name, status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
        {
          replacements: { clientId: user.clientId },
          type: 'SELECT'
        }
      ) as any[];

      workspaces = allCompanies.map(c => ({
        id: c.id,
        name: c.name,
        role: { id: 0, name: 'Client Admin' },
        status: c.status || 'Active',
      }));
    } else {
      workspaces = user.userCompanies?.map((uc) => {
        // Extract permissions for the active workspace
        if (uc.company?.id?.toString() === activeCompanyId?.toString()) {
          if (uc.role && uc.role.roleActionPermissions) {
            permissions = uc.role.roleActionPermissions
              .map((rp: any) => 
                rp.resourceAction?.resource 
                  ? `${rp.resourceAction.resource.name.toLowerCase()}:${rp.resourceAction.name.toLowerCase()}` 
                  : null
              )
              .filter(Boolean) as string[];
          }
        }
        
        return {
          id: uc.company?.id,
          name: uc.company?.name,
          role: uc.role ? { id: uc.role.id, name: uc.role.name } : null,
          status: uc.status,
        };
      }) || [];
    }

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
      permissions,
      employeeId: req.user.employeeId || null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-menu')
  async getMyMenu(@Request() req) {
    const profile = await this.getProfile(req);
    const userPermissions = profile.permissions || [];
    const isSuperAdmin = profile.type === 'super_admin';
    const isClientAdmin = profile.type === 'client_admin';
    console.log("=== GET MY MENU DEBUG ===");
    console.log("req.user:", req.user);
    console.log("profile.type:", profile.type);
    console.log("isSuperAdmin:", isSuperAdmin);

    const menuData = await this.systemService.getSidebar({
      type: profile.type,
      clientId: profile.clientId,
      roles: profile.roles || []
    });

    const filterItem = (item: any) => {
      if (!item.permission_link) return true;
      if (isSuperAdmin || isClientAdmin) return true;
      return userPermissions.includes(item.permission_link);
    };

    const folders = menuData.folders.map(f => {
      const items = (f.items || []).filter(filterItem);
      return {
        id: `folder-${f.id}`,
        title: f.name,
        name: f.name,
        route: null,
        href: '#',
        icon: f.icon_name || f.icon,
        type: 'parent',
        items: items.map((i: any) => ({
          id: i.id,
          title: i.name,
          name: i.name,
          route: i.route,
          href: i.route || '#',
          icon: i.icon_name || i.icon,
          permission: i.permission_link,
          type: 'item'
        }))
      };
    }).filter(f => f.items.length > 0 || isSuperAdmin);

    const standaloneItems = menuData.standaloneItems.filter(filterItem).map((i: any) => ({
      id: i.id,
      title: i.name,
      name: i.name,
      route: i.route,
      href: i.route || '#',
      icon: i.icon_name || i.icon,
      permission: i.permission_link,
      type: 'item'
    }));

    return [...folders, ...standaloneItems];
  }


  @UseGuards(JwtAuthGuard)
  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  async switchWorkspace(@Request() req, @Body() body: SwitchWorkspaceDto) {
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
        const actualClientId = req.user.clientId;
        
        if (!actualClientId) {
          throw new ForbiddenException('Invalid client session');
        }

        const targetCompany = await this.userCompanyModel.sequelize!.query(
          `SELECT id FROM "companies" WHERE id = :companyId AND "clientId" = :clientId LIMIT 1;`,
          {
            replacements: { companyId, clientId: actualClientId },
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

    // Update user's lastCompanyId if they are a real user
    if (req.user.userId) {
      await this.usersService.updateUser(req.user.userId, { lastCompanyId: companyId });
    }

    return {
      success: true,
      lastCompanyId: companyId,
    };
  }

  @UseGuards(JwtAuthGuard, RateLimit(5, 15))
  @Put('change-password')
  async changePassword(@Request() req, @Body() body: ChangePasswordDto) {
    const userId = req.user.userId || req.user.sub;
    return this.profileService.changePassword(userId, body);
  }
}
