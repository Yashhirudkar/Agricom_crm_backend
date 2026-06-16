import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { CompanyHrPoliciesService } from '../services/company-hr-policies.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { UpsertCompanyHrPolicyDto } from '../dto/company-hr-policies.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('company/hr-policies')
export class CompanyHrPoliciesController {
  constructor(private readonly policiesService: CompanyHrPoliciesService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'];
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
    };
  }

  @Get()
  @RequirePermission('hrpolicy:read')
  getHrPolicies(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.policiesService.getHrPolicies(companyId);
  }

  @Put()
  @RequirePermission('hrpolicy:update')
  upsertHrPolicies(@Body() dto: UpsertCompanyHrPolicyDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.policiesService.upsertHrPolicies(companyId, dto, actor);
  }
}
