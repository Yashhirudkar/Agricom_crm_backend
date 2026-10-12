import {
  ForbiddenException,
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../../rbac/decorators/require-any-permission.decorator';
import { BusinessTransactionService } from '../services/business-transaction.service';

@Controller('business-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BusinessTransactionController {
  constructor(private readonly service: BusinessTransactionService) {}

  @Get(':reference')
  @RequireAnyPermission(
    'enquiry:view',
    'sales-contract:view',
    'purchase-contracts:view',
    'logistics:view',
    'shipments:view',
    'cargo_availability:view',
  )
  findByReference(@Param('reference') reference: string, @Req() req: any) {
    const companyId = Number(req.user?.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new ForbiddenException('An active company context is required');
    }
    return this.service.findByReference(reference, companyId);
  }
}
