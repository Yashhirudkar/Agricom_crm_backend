import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ShippingLineService } from './shipping-line.service';
import { CreateShippingLineDto } from './dto/create-shipping-line.dto';
import { UpdateShippingLineDto } from './dto/update-shipping-line.dto';
import { QueryShippingLineDto } from './dto/query-shipping-line.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller(['masters/shipping-lines', 'shipping-lines'])
export class ShippingLineController {
  constructor(private readonly service: ShippingLineService) {}

  @Get()
  async findAll(@Query() query: QueryShippingLineDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateShippingLineDto, @Req() req: any) {
    return await this.service.create(dto, req.user);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShippingLineDto,
    @Req() req: any,
  ) {
    return await this.service.update(id, dto, req.user);
  }

  @Patch(':id/toggle')
  async toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return await this.service.toggleStatus(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.service.remove(id);
  }
}
