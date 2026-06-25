import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { BranchesService } from '../services/branches.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import {
  CreateBranchDto,
  UpdateBranchDto,
  GetBranchesFilterDto,
} from '../dto/branches.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getActor(req: any) {
    return {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      type: req.user.type || null,
    };
  }

  @Post()
  @RequirePermission('branches:create')
  @HttpCode(HttpStatus.CREATED)
  createBranch(@Body() dto: CreateBranchDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.branchesService.createBranch(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('branches:read')
  getBranches(@Query() query: GetBranchesFilterDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.branchesService.getBranches(companyId, query);
  }

  @Get('options')
  @RequirePermission('branches:read')
  getBranchOptions(
    @Request() req,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = this.getCompanyId(req);
    return this.branchesService.getBranchesForOptions(
      companyId,
      search,
      page,
      limit,
    );
  }

  @Get(':id')
  @RequirePermission('branches:read')
  getBranchById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.branchesService.getBranchById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('branches:update')
  updateBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.branchesService.updateBranch(id, companyId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('branches:delete')
  deleteBranch(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.branchesService.deleteBranch(id, companyId, actor);
  }
}
