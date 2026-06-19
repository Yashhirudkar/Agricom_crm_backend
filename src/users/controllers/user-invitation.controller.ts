import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { UserInvitationService } from '../services/user-invitation.service';
import { VerifyInvitationDto, AcceptInvitationDto } from '../dto/users.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@Controller('invitations')
export class UserInvitationController {
  constructor(private readonly invitationService: UserInvitationService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('CreateInvitation')
  @RequirePermission('users:create')
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Body()
    dto: {
      email: string;
      roleId: number;
      companyIds: number[];
      clientId?: number;
    },
    @Request() req,
  ) {
    const isSuper = req.user.type === 'super_admin';
    let targetClientId = req.user.clientId;

    if (isSuper) {
      if (!dto.clientId) {
        throw new ForbiddenException(
          'Super Admin must specify a clientId to create an invitation',
        );
      }
      targetClientId = dto.clientId;
    }

    return this.invitationService.createInvitation({
      email: dto.email,
      roleId: dto.roleId,
      companyIds: dto.companyIds,
      clientId: targetClientId,
      createdBy: req.user.userId || req.user.sub,
    });
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get()
  @RequirePermission('users:read')
  async getInvitations(
    @Request() req,
    @Query('clientId') filterClientId?: string,
  ) {
    const isSuper = req.user.type === 'super_admin';
    const clientId = isSuper
      ? filterClientId
        ? parseInt(filterClientId, 10)
        : null
      : req.user.clientId;

    return this.invitationService.getInvitations(clientId);
  }

  // Public endpoint: verify token and get details (email, client name, role name, company names)
  @Get('verify')
  async verifyInvitation(@Query() query: VerifyInvitationDto) {
    return this.invitationService.getInvitationDetails(query.token);
  }

  // Public endpoint: accept invitation
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
  ) {
    const user = await this.invitationService.acceptInvitation({
      token: dto.token,
      name: dto.name,
      password: dto.password,
    });

    const { password, ...safeUser } = (user as any).toJSON();
    return safeUser;
  }
}
