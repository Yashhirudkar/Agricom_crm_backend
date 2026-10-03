import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { BagSpecsService } from '../services/bag-specs.service';
import { CreateBagTypeDto } from '../dto/create-bag-type.dto';
import { UpdateBagTypeDto } from '../dto/update-bag-type.dto';
import { CreatePackingTypeDto } from '../dto/create-packing-type.dto';
import { UpdatePackingTypeDto } from '../dto/update-packing-type.dto';
import { CreateBagSpecDto } from '../dto/create-bag-spec.dto';
import { UpdateBagSpecDto } from '../dto/update-bag-spec.dto';
import { QueryBagSpecDto } from '../dto/query-bag-spec.dto';
import { AssignPackagingDto } from '../dto/assign-packaging.dto';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { RequireAnyPermission } from '../../../rbac/decorators/require-any-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters')
export class BagSpecsController {
  constructor(private readonly bagSpecsService: BagSpecsService) {}

  // ─── BAG TYPES ────────────────────────────────────────────────────────────

  @Get('bag-types')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findAllBagTypes(@Query('isActive') isActive?: string, @Req() req?: any) {
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.bagSpecsService.findAllBagTypes(active, req?.user?.companyId);
  }

  @Get('stitching-types')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findAllStitchingTypes() {
    return [
      { id: 1, name: 'Double Folded Machine Stitched' },
      { id: 2, name: 'Single Folded Hand Stitched' },
      { id: 3, name: 'Laminated Heat Sealed' },
      { id: 4, name: 'Mouth Hemmed & Bottom Stitched' },
      { id: 5, name: 'Top Open & Bottom Machine Stitched' },
    ];
  }

  @Get('marking-types')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findAllMarkingTypes() {
    return [
      { id: 1, name: 'Standard Export Shipping Marks' },
      { id: 2, name: 'As Per Buyer Requirement' },
      { id: 3, name: 'No Special Marking' },
      { id: 4, name: 'Supplier Standard Shipping Marks' },
      { id: 5, name: 'Custom Stencilled Marking' },
    ];
  }

  @Post('bag-types')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createBagType(@Body() dto: CreateBagTypeDto, @Req() req?: any) {
    return this.bagSpecsService.createBagType(dto, req?.user?.companyId);
  }

  @Patch('bag-types/:id')
  @RequirePermission('bagspec:update')
  updateBagType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBagTypeDto,
    @Req() req?: any,
  ) {
    return this.bagSpecsService.updateBagType(id, dto, req?.user?.companyId);
  }

  @Delete('bag-types/:id')
  @RequirePermission('bagspec:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBagType(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    return this.bagSpecsService.deleteBagType(id, req?.user?.companyId);
  }

  // ─── PACKING TYPES ────────────────────────────────────────────────────────

  // Lightweight options endpoint — accessible to any logged-in user
  @Get('packing-types/options')
  findPackingTypeOptions(@Req() req?: any) {
    return this.bagSpecsService.findAllPackingTypes(true, req?.user?.companyId);
  }

  @Get('packing-types')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findAllPackingTypes(@Query('isActive') isActive?: string, @Req() req?: any) {
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.bagSpecsService.findAllPackingTypes(active, req?.user?.companyId);
  }

  @Post('packing-types')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createPackingType(@Body() dto: CreatePackingTypeDto, @Req() req?: any) {
    return this.bagSpecsService.createPackingType(dto, req?.user?.companyId);
  }

  @Patch('packing-types/:id')
  @RequirePermission('bagspec:update')
  updatePackingType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePackingTypeDto,
    @Req() req?: any,
  ) {
    return this.bagSpecsService.updatePackingType(id, dto, req?.user?.companyId);
  }

  @Delete('packing-types/:id')
  @RequirePermission('bagspec:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePackingType(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    return this.bagSpecsService.deletePackingType(id, req?.user?.companyId);
  }

  // ─── BAG SPECIFICATIONS ───────────────────────────────────────────────────

  @Get('bag-specifications')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findAllSpecs(@Query() query: QueryBagSpecDto, @Req() req?: any) {
    return this.bagSpecsService.findAllSpecs({ ...query, companyId: req?.user?.companyId } as any);
  }

  @Get('bag-specifications/:id')
  @RequireAnyPermission('bagspec:view', 'sales_contract:view', 'enquiry:view')
  findOneSpec(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    return this.bagSpecsService.findOneSpec(id, req?.user?.companyId);
  }

  @Post('bag-specifications')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createSpec(@Body() dto: CreateBagSpecDto, @Req() req?: any) {
    return this.bagSpecsService.createSpec(dto, req?.user?.companyId);
  }

  @Patch('bag-specifications/:id')
  @RequirePermission('bagspec:update')
  updateSpec(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBagSpecDto,
    @Req() req?: any,
  ) {
    return this.bagSpecsService.updateSpec(id, dto, req?.user?.companyId);
  }

  @Delete('bag-specifications/:id')
  @RequirePermission('bagspec:delete')
  deleteSpec(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    return this.bagSpecsService.deleteSpec(id, req?.user?.companyId);
  }

  // ─── PRODUCT PACKAGING ASSIGNMENTS ───────────────────────────────────────

  @Get('products/:id/packaging')
  @RequirePermission('product:view')
  getProductPackaging(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    return this.bagSpecsService.getProductPackaging(id, req?.user?.companyId);
  }

  @Put('products/:id/packaging')
  @RequirePermission('product:update')
  assignProductPackaging(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPackagingDto,
    @Req() req?: any,
  ) {
    return this.bagSpecsService.assignProductPackaging(id, dto, req?.user?.companyId);
  }
}
