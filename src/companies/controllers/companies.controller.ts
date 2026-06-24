import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { CompaniesService } from '../services/companies.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateCompanyDto, UpdateCompanyDto, DeleteCompanyDto } from '../dto/companies.dto';

// Ensure directories exist
const logosDir = './uploads/company/logos';
const faviconsDir = './uploads/company/favicons';

if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });
if (!fs.existsSync(faviconsDir)) fs.mkdirSync(faviconsDir, { recursive: true });

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|svg|webp|ico/;
  const ext = allowedTypes.test(extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype);
  if (ext && mime) {
    return cb(null, true);
  }
  cb(new BadRequestException('Only image files (jpeg, jpg, png, svg, webp, ico) are allowed'), false);
};

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post('CreateCompany')
  @RequirePermission('companies:create')
  @HttpCode(HttpStatus.CREATED)
  createCompany(@Body() dto: CreateCompanyDto, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    if (req.user.type === 'super_admin') {
      if (!dto.clientId) {
        throw new ForbiddenException('Super Admin must provide a clientId to create a company.');
      }
      return this.companiesService.createCompany(dto.clientId, dto, actor);
    }

    return this.companiesService.createCompany(req.user.clientId, dto, actor);
  }

  @Post('UpdateCompany')
  @RequirePermission('companies:update')
  @HttpCode(HttpStatus.OK)
  updateCompany(@Body() dto: UpdateCompanyDto, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.updateCompany(dto.id, clientId, dto, actor);
  }

  @Post('DeleteCompany')
  @RequirePermission('companies:delete')
  @HttpCode(HttpStatus.OK)
  deleteCompany(@Body() dto: DeleteCompanyDto, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.deleteCompany(dto.id, clientId, actor);
  }

  @Get('GetCompanies')
  @RequirePermission('companies:read')
  getCompanies(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('companyType') companyType?: string,
    @Query('industryType') industryType?: string,
    @Query('status') status?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.getCompanies(clientId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      companyType,
      industryType,
      status,
      sortField,
      sortOrder,
    });
  }

  @Get('GetCompanyById')
  @RequirePermission('companies:read')
  getCompanyById(@Query('id', ParseIntPipe) id: number, @Request() req) {
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.getCompanyById(id, clientId);
  }

  @Get('options')
  @RequirePermission('companies:read')
  async getCompanyOptions(
    @Request() req,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.getCompaniesForOptions(clientId, search, page, limit);
  }

  @Post('upload-logo')
  @RequirePermission('companies:update')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: logosDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `logo-${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  }))
  uploadLogo(@UploadedFile() file: Express.Multer.File, @Body('oldUrl') oldUrl?: string) {
    if (!file) throw new BadRequestException('No file uploaded');
    
    // cleanup old file
    if (oldUrl && oldUrl.startsWith('/uploads/company/logos/')) {
      const oldPath = join(process.cwd(), oldUrl);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch(e) {}
      }
    }
    
    return { success: true, url: `/uploads/company/logos/${file.filename}` };
  }

  @Post('upload-favicon')
  @RequirePermission('companies:update')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: faviconsDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `favicon-${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  }))
  uploadFavicon(@UploadedFile() file: Express.Multer.File, @Body('oldUrl') oldUrl?: string) {
    if (!file) throw new BadRequestException('No file uploaded');
    
    // cleanup old file
    if (oldUrl && oldUrl.startsWith('/uploads/company/favicons/')) {
      const oldPath = join(process.cwd(), oldUrl);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch(e) {}
      }
    }
    
    return { success: true, url: `/uploads/company/favicons/${file.filename}` };
  }
}
