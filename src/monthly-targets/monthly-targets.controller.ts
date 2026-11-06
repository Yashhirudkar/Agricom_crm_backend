import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Put,
  Patch,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesOnlyGuard } from './guards/sales-only.guard';
import { MonthlyTargetsService } from './monthly-targets.service';
import { CreateMonthlyTargetDto } from './dto/create-monthly-target.dto';
import { QueryMonthlyTargetDto } from './dto/query-monthly-target.dto';

@Controller('monthly-targets')
@UseGuards(JwtAuthGuard, SalesOnlyGuard)
export class MonthlyTargetsController {
  constructor(private readonly service: MonthlyTargetsService) {}

  @Get('current')
  async getCurrentTarget(
    @Req() req: any,
    @Query() query: QueryMonthlyTargetDto,
  ) {
    const userId = req.user.userId || req.user.id;
    return this.service.getTargetWithStats(userId, query.month, query.year);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTarget(
    @Req() req: any,
    @Body() dto: CreateMonthlyTargetDto,
  ) {
    const userId = req.user.userId || req.user.id;
    return this.service.createTarget(userId, dto);
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    const userId = req.user.userId || req.user.id;
    return this.service.getHistory(userId);
  }

  // Explicitly disallow any updates to enforce lock permanently
  @Put(':id')
  rejectPut() {
    throw new BadRequestException(
      'Monthly targets are permanently locked and cannot be edited.',
    );
  }

  @Put()
  rejectPutRoot() {
    throw new BadRequestException(
      'Monthly targets are permanently locked and cannot be edited.',
    );
  }

  @Patch(':id')
  rejectPatch() {
    throw new BadRequestException(
      'Monthly targets are permanently locked and cannot be edited.',
    );
  }

  @Patch()
  rejectPatchRoot() {
    throw new BadRequestException(
      'Monthly targets are permanently locked and cannot be edited.',
    );
  }

  @Delete(':id')
  rejectDelete() {
    throw new BadRequestException(
      'Monthly targets cannot be deleted once saved.',
    );
  }

  @Delete()
  rejectDeleteRoot() {
    throw new BadRequestException(
      'Monthly targets cannot be deleted once saved.',
    );
  }
}

