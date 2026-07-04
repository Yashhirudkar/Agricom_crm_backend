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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters')
export class BagSpecsController {
  constructor(private readonly bagSpecsService: BagSpecsService) {}

  // ─── BAG TYPES ────────────────────────────────────────────────────────────

  @Get('bag-types')
  @RequirePermission('bagspec:view')
  findAllBagTypes(@Query('isActive') isActive?: string) {
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.bagSpecsService.findAllBagTypes(active);
  }

  @Post('bag-types')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createBagType(@Body() dto: CreateBagTypeDto) {
    return this.bagSpecsService.createBagType(dto);
  }

  @Patch('bag-types/:id')
  @RequirePermission('bagspec:update')
  updateBagType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBagTypeDto,
  ) {
    return this.bagSpecsService.updateBagType(id, dto);
  }

  @Delete('bag-types/:id')
  @RequirePermission('bagspec:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBagType(@Param('id', ParseIntPipe) id: number) {
    return this.bagSpecsService.deleteBagType(id);
  }

  // ─── PACKING TYPES ────────────────────────────────────────────────────────

  @Get('packing-types')
  @RequirePermission('bagspec:view')
  findAllPackingTypes(@Query('isActive') isActive?: string) {
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.bagSpecsService.findAllPackingTypes(active);
  }

  @Post('packing-types')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createPackingType(@Body() dto: CreatePackingTypeDto) {
    return this.bagSpecsService.createPackingType(dto);
  }

  @Patch('packing-types/:id')
  @RequirePermission('bagspec:update')
  updatePackingType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePackingTypeDto,
  ) {
    return this.bagSpecsService.updatePackingType(id, dto);
  }

  @Delete('packing-types/:id')
  @RequirePermission('bagspec:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePackingType(@Param('id', ParseIntPipe) id: number) {
    return this.bagSpecsService.deletePackingType(id);
  }

  // ─── BAG SPECIFICATIONS ───────────────────────────────────────────────────

  @Get('bag-specifications')
  @RequirePermission('bagspec:view')
  findAllSpecs(@Query() query: QueryBagSpecDto) {
    return this.bagSpecsService.findAllSpecs(query);
  }

  @Get('bag-specifications/:id')
  @RequirePermission('bagspec:view')
  findOneSpec(@Param('id', ParseIntPipe) id: number) {
    return this.bagSpecsService.findOneSpec(id);
  }

  @Post('bag-specifications')
  @RequirePermission('bagspec:create')
  @HttpCode(HttpStatus.CREATED)
  createSpec(@Body() dto: CreateBagSpecDto) {
    return this.bagSpecsService.createSpec(dto);
  }

  @Patch('bag-specifications/:id')
  @RequirePermission('bagspec:update')
  updateSpec(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBagSpecDto,
  ) {
    return this.bagSpecsService.updateSpec(id, dto);
  }

  @Delete('bag-specifications/:id')
  @RequirePermission('bagspec:delete')
  deleteSpec(@Param('id', ParseIntPipe) id: number) {
    return this.bagSpecsService.deleteSpec(id);
  }

  // ─── PRODUCT PACKAGING ASSIGNMENTS ───────────────────────────────────────

  @Get('products/:id/packaging')
  @RequirePermission('product:view')
  getProductPackaging(@Param('id', ParseIntPipe) id: number) {
    return this.bagSpecsService.getProductPackaging(id);
  }

  @Put('products/:id/packaging')
  @RequirePermission('product:update')
  assignProductPackaging(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPackagingDto,
  ) {
    return this.bagSpecsService.assignProductPackaging(id, dto);
  }
}
