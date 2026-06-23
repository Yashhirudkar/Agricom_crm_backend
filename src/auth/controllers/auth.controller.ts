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
        `SELECT id, name, "logoUrl", status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
        {
          replacements: { clientId: client.id },
          type: 'SELECT'
        }
      ) as any[];

      const workspaces = allCompanies.map(c => ({
        id: c.id,
        name: c.name,
        logoUrl: c.logoUrl,
        role: { id: 0, name: 'Client Admin' },
        status: c.status || 'Active',
      }));

      const activeCompanyId = req.headers['x-company-id'];
      const activeWorkspace = workspaces.find(w => w.id?.toString() === activeCompanyId?.toString()) || workspaces[0];

      const company = activeWorkspace ? {
        id: activeWorkspace.id,
        name: activeWorkspace.name,
        logoUrl: activeWorkspace.logoUrl || null,
      } : { name: "Agricom", logoUrl: null };

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        type: 'client_admin',
        isActive: client.isActive,
        workspaces,
        company,
      };
    }

    const userId = req.user.userId || req.user.sub;
    const user = await this.usersService.findByIdWithRoles(userId);
    if (!user) throw new UnauthorizedException('User not found');

    // Determine type
    let type: 'super_admin' | 'client_admin' | 'user' = 'user';
    const hasSuperAdminRole = user.roles?.some((r) => r.name === 'Admin');
    const hasClientAdminRole = user.roles?.some((r) => r.name === 'Client Admin');

    if (hasSuperAdminRole || (user.clientId === null && user.email === 'admin@agricom.com')) {
      type = 'super_admin';
    } else if (hasClientAdminRole) {
      type = 'client_admin';
    }

    let workspaces = [];
    let permissions: string[] = [];
    let derivedClientId = user.clientId;

    const activeCompanyId = req.headers['x-company-id'] || user.lastCompanyId || user.userCompanies?.[0]?.company?.id;


    
    if (type === 'client_admin') {
      const allCompanies = await this.userCompanyModel.sequelize!.query(
        `SELECT id, name, "logoUrl", status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
        {
          replacements: { clientId: user.clientId },
          type: 'SELECT'
        }
      ) as any[];

      workspaces = allCompanies.map(c => ({
        id: c.id,
        name: c.name,
        logoUrl: c.logoUrl,
        role: { id: 0, name: 'Client Admin' },
        status: c.status || 'Active',
      }));
    } else {
      workspaces = await Promise.all((user.userCompanies || []).map(async (uc) => {
        // Extract permissions for the active workspace
        if (uc.company?.id?.toString() === activeCompanyId?.toString()) {
          derivedClientId = uc.company.clientId || derivedClientId;
          
          if (uc.role) {
            const perms = await this.userCompanyModel.sequelize!.query(`
              SELECT m.name AS resource_name, a.name AS action_name
              FROM role_action_permissions rap
              JOIN resource_actions a ON a.id = rap.resource_action_id
              JOIN module_resources m ON m.id = a.resource_id
              WHERE rap.role_id = :roleId
            `, { 
              replacements: { roleId: uc.role.id }, 
              type: 'SELECT' 
            }) as any[];
            
            permissions = perms.map((p) => `${p.resource_name.toLowerCase()}:${p.action_name.toLowerCase()}`);
          }
        }
        
        return {
          id: uc.company?.id,
          name: uc.company?.name,
          logoUrl: uc.company?.logoUrl,
          role: uc.role ? { id: uc.role.id, name: uc.role.name } : null,
          status: uc.status,
        };
      }));
    }

    let activeCompanyDetails = null;
    if (activeCompanyId) {
       // if client admin, we can find in workspaces
       if (type === 'client_admin') {
          activeCompanyDetails = workspaces.find(w => w.id?.toString() === activeCompanyId?.toString());
       } else {
          const userCompany = user.userCompanies?.find(uc => uc.company?.id?.toString() === activeCompanyId?.toString());
          if (userCompany && userCompany.company) {
             activeCompanyDetails = { id: userCompany.company.id, name: userCompany.company.name, logoUrl: userCompany.company.logoUrl };
          } else {
             // For super admin switching to a workspace not in userCompanies
             if (type === 'super_admin') {
               const targetCompany = await this.userCompanyModel.sequelize!.query(
                  `SELECT id, name, "logoUrl" FROM "companies" WHERE id = :companyId LIMIT 1;`,
                  { replacements: { companyId: activeCompanyId }, type: 'SELECT' }
               ) as any[];
               if (targetCompany.length > 0) {
                 activeCompanyDetails = targetCompany[0];
               }
             }
          }
       }
    }
    
    if (!activeCompanyDetails && workspaces.length > 0) {
      activeCompanyDetails = workspaces[0];
    }

    const companyData = activeCompanyDetails ? {
      id: activeCompanyDetails.id,
      name: activeCompanyDetails.name,
      logoUrl: activeCompanyDetails.logoUrl || null,
    } : { name: "Agricom", logoUrl: null };



    return {
      id: user.id,
      name: user.name,
      email: user.email,
      type,
      status: user.status,
      clientId: derivedClientId,
      lastCompanyId: user.lastCompanyId,
      isActive: user.isActive,
      roles: user.roles?.map((r: any) => ({
        id: r.id,
        name: r.name,
      })) ?? [],
      workspaces,
      permissions,
      company: companyData,
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
        iconColor: f.icon_color || null,
        isCollapsible: f.is_collapsible === true,
        type: 'parent',
        items: items.map((i: any) => ({
          id: i.id,
          title: i.name,
          name: i.name,
          route: i.route,
          href: i.route || '#',
          icon: i.icon_name || i.icon,
          iconColor: i.final_color || null,
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
      iconColor: i.final_color || null,
      permission: i.permission_link,
      type: 'item'
    }));

    const finalMenu = [...folders, ...standaloneItems];

    return finalMenu;
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
