import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as crypto from 'crypto';
import { Response } from 'express';
import { PartnerDnbReportService, DNB_REPORT_UPLOAD_DIR } from './partner-dnb-report.service';
import { CreatePartnerDnbReportDto } from './dto/create-partner-dnb-report.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

export const dnbReportMulterConfig = {
  storage: diskStorage({
    destination: DNB_REPORT_UPLOAD_DIR,
    filename: (req: any, file, cb) => {
      const uniqueSuffix = crypto.randomUUID();
      const ext = extname(file.originalname).toLowerCase();
      const partnerId = req.params?.partnerId || 'partner';
      cb(null, `dnb_${partnerId}_${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        new BadRequestException('Only PDF, JPG, JPEG, and PNG files under 10MB are allowed.'),
        false,
      );
    }
    cb(null, true);
  },
};

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners')
export class PartnerDnbReportController {
  constructor(private readonly dnbReportService: PartnerDnbReportService) {}

  @Get(':partnerId/dnb-reports')
  @RequirePermission('partner:view')
  async getReports(@Param('partnerId', ParseIntPipe) partnerId: number) {
    return await this.dnbReportService.getReportsByPartner(partnerId);
  }

  @Post(':partnerId/dnb-reports')
  @RequirePermission('partner:update')
  @AuditLog({ entityType: 'PartnerDnbReport', action: 'CREATE' })
  @UseInterceptors(FileInterceptor('file', dnbReportMulterConfig))
  async createReport(
    @Param('partnerId', ParseIntPipe) partnerId: number,
    @Body() dto: CreatePartnerDnbReportDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return await this.dnbReportService.createReport(partnerId, dto, file, req.user);
  }

  @Get('dnb-reports/:reportId/download')
  @RequirePermission('partner:view')
  async downloadReport(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Res() res: Response,
  ) {
    const { record, filePath } = await this.dnbReportService.getReportRecord(reportId);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(record.originalFileName)}"`,
    );
    return res.sendFile(filePath);
  }

  @Get('dnb-reports/:reportId/view')
  @RequirePermission('partner:view')
  async viewReport(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Res() res: Response,
  ) {
    const { record, filePath } = await this.dnbReportService.getReportRecord(reportId);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(record.originalFileName)}"`,
    );
    return res.sendFile(filePath);
  }
}
