import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { EquipmentOptionService } from './equipment-option.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('masters/equipment-options')
export class EquipmentOptionController {
  constructor(private readonly service: EquipmentOptionService) { }

  @Get()
  async findAll(@Query('category') category?: string, @Req() req?: any) {
    return await this.service.findAll(category, req?.user?.companyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: { category: string; value: string }, @Req() req?: any) {
    return await this.service.create(dto, req?.user?.companyId);
  }
}
