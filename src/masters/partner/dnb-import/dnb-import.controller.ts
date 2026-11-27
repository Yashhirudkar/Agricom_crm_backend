import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../../../rbac/decorators/require-any-permission.decorator';
import {
  DnbAnnualSalesExtractionResponse,
  DnbImportService,
} from './dnb-import.service';
import { DnbFullReportExtractionResponse } from './dnb-import.types';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners/dnb-import')
export class DnbImportController {
  constructor(private readonly dnbImportService: DnbImportService) {}

  @Post('extract-annual-sales')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('partner:create', 'partner:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async extractAnnualSales(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DnbAnnualSalesExtractionResponse> {
    return this.dnbImportService.extractAnnualSales(file);
  }

  @Post('extract-report')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('partner:create', 'partner:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async extractFullReport(
    @UploadedFile() file: Express.Multer.File,
    @Query('excludePartnerId') excludePartnerId?: string,
    @Req() req?: any,
  ): Promise<DnbFullReportExtractionResponse> {
    const parsedExclude = excludePartnerId
      ? parseInt(excludePartnerId, 10)
      : undefined;
    return this.dnbImportService.extractFullReport(file, {
      companyId: req?.user?.companyId,
      excludePartnerId:
        parsedExclude && !Number.isNaN(parsedExclude) ? parsedExclude : undefined,
    });
  }
}
