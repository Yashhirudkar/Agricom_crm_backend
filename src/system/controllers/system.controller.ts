import { Controller, Get, UseGuards } from '@nestjs/common';
import { SystemService } from '../services/system.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('sidebar')
  async getSidebar() {
    return this.systemService.getSidebarModules();
  }
}
