import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { SystemService } from '../services/system.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('sidebar')
  async getSidebar(@Req() req: any) {
    return this.systemService.getSidebar(req.user);
  }
}
