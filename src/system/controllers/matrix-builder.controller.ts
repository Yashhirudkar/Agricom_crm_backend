import { Controller, Post, Delete, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { MatrixBuilderService } from '../services/matrix-builder.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system/matrix')
export class MatrixBuilderController {
  constructor(private readonly matrixBuilderService: MatrixBuilderService) {}

  @Get('registry')
  @RequirePermission('system:manage_matrix')
  async getRegistry() {
    return this.matrixBuilderService.getRegistry();
  }

  @Post('module')
  @RequirePermission('system:manage_matrix')
  async createModule(@Req() req: any, @Body() dto: { name: string; icon_name?: string; sort_order?: number }) {
    return this.matrixBuilderService.createModule(req.user.id, dto);
  }

  @Post('resource')
  @RequirePermission('system:manage_matrix')
  async createResource(@Req() req: any, @Body() dto: { name: string; display_name?: string; module_id: number; sort_order?: number }) {
    return this.matrixBuilderService.createResource(req.user.id, dto);
  }

  @Post('action')
  @RequirePermission('system:manage_matrix')
  async createAction(@Req() req: any, @Body() dto: { name: string; display_name?: string; resource_id: number; sort_order?: number }) {
    return this.matrixBuilderService.createAction(req.user.id, dto);
  }

  @Delete('module/:id')
  @RequirePermission('system:manage_matrix')
  async deleteModule(@Req() req: any, @Param('id') id: string) {
    return this.matrixBuilderService.deleteModule(req.user.id, parseInt(id, 10));
  }

  @Delete('resource/:id')
  @RequirePermission('system:manage_matrix')
  async deleteResource(@Req() req: any, @Param('id') id: string) {
    return this.matrixBuilderService.deleteResource(req.user.id, parseInt(id, 10));
  }

  @Delete('action/:id')
  @RequirePermission('system:manage_matrix')
  async deleteAction(@Req() req: any, @Param('id') id: string) {
    return this.matrixBuilderService.deleteAction(req.user.id, parseInt(id, 10));
  }
}
