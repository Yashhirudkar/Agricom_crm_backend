import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Partner } from './partner.model';
import { PartnerDnbReport } from './partner-dnb-report.model';
import { CreatePartnerDnbReportDto } from './dto/create-partner-dnb-report.dto';
import * as path from 'path';
import * as fs from 'fs';

export const DNB_REPORT_UPLOAD_DIR = './storage/dnb-reports';

@Injectable()
export class PartnerDnbReportService {
  constructor(
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(PartnerDnbReport)
    private readonly dnbReportModel: typeof PartnerDnbReport,
    private readonly sequelize: Sequelize,
  ) {
    if (!fs.existsSync(DNB_REPORT_UPLOAD_DIR)) {
      fs.mkdirSync(DNB_REPORT_UPLOAD_DIR, { recursive: true });
    }
  }

  async getReportsByPartner(partnerId: number): Promise<PartnerDnbReport[]> {
    const partner = await this.partnerModel.findOne({ where: { id: partnerId } });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    return await this.dnbReportModel.findAll({
      where: { partnerId },
      include: [{ model: Partner, attributes: ['id', 'yearOfEstablishment', 'entityName'] }],
      order: [['createdAt', 'DESC']],
    });
  }

  async createReport(
    partnerId: number,
    dto: CreatePartnerDnbReportDto,
    file: Express.Multer.File,
    user: any,
  ): Promise<PartnerDnbReport> {
    const partner = await this.partnerModel.findOne({ where: { id: partnerId } });
    if (!partner) {
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new NotFoundException('Partner not found');
    }

    if (!file) {
      throw new BadRequestException('Report file upload is required (.pdf, .jpg, .jpeg, .png)');
    }

    // Validate Report Date <= current date
    const reportDate = new Date(dto.reportDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (reportDate > today) {
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException('Report Date cannot be a future date');
    }

    try {
      return await this.sequelize.transaction(async (transaction) => {
        // Mark previous reports as not latest
        await this.dnbReportModel.update(
          { isLatest: false },
          {
            where: { partnerId, isLatest: true },
            transaction,
          },
        );

        // Create new report with isLatest = true
        const newReport = await this.dnbReportModel.create(
          {
            partnerId,
            reportDate: dto.reportDate,
            reportFile: file.filename,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            riskFactor: dto.riskFactor,
            creditLimit: Number(dto.creditLimit),
            failureScore: dto.failureScore,
            paydex: Number(dto.paydex),
            dnbRating: dto.dnbRating,
            source: dto.source || 'MANUAL',
            isLatest: true,
            createdBy: user?.id || user?.userId || null,
          },
          { transaction },
        );

        return newReport;
      });
    } catch (err) {
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw err;
    }
  }

  async getReportRecord(reportId: number): Promise<{ record: PartnerDnbReport; filePath: string }> {
    const record = await this.dnbReportModel.findByPk(reportId);
    if (!record) {
      throw new NotFoundException('D&B report record not found');
    }

    const filePath = path.join(process.cwd(), DNB_REPORT_UPLOAD_DIR, record.reportFile);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Report file not found on disk');
    }

    return { record, filePath };
  }
}
