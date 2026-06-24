import { Controller, Get, UseGuards } from '@nestjs/common';
import { OptionsService } from '../services/options.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('system/options')
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Get('all')
  getAllOptions() {
    return this.optionsService.getAllOptions();
  }
}
