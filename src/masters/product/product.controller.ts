import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @RequirePermission('product:create')
  @AuditLog({ entityType: 'Product', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Get()
  @RequirePermission('product:view')
  async findAll(@Query() query: QueryProductDto) {
    const result = await this.productService.findAll(query);

    return result;
  }

  @Get(':id')
  @RequirePermission('product:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.productService.findOne(id);

    return item;
  }

  @Patch(':id')
  @RequirePermission('product:update')
  @AuditLog({ entityType: 'Product', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productService.update(id, updateProductDto);
  }

  @Patch(':id/restore')
  @RequirePermission('product:update')
  @AuditLog({ entityType: 'Product', action: 'RESTORE' })
  restore(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.productService.restore(id, req.user);
  }

  @Delete(':id')
  @RequirePermission('product:delete')
  @AuditLog({ entityType: 'Product', action: 'DELETE' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.productService.remove(id, reason, req?.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('product:force_delete')
  @AuditLog({ entityType: 'Product', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: any,
  ) {
    if (req.user.type !== 'super_admin') {
      throw new ForbiddenException('Super Admin only');
    }
    return this.productService.removePermanent(id, reason, req.user);
  }
}
