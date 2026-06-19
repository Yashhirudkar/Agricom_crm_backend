import { Controller, Get, Put, Patch, Post, Delete, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, ParseIntPipe, UsePipes, ValidationPipe } from '@nestjs/common';
import { ProfileService } from '../services/profile.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RateLimit } from '../guards/rate-limit.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { UpdatePersonalDto } from '../dto/update-personal.dto';
import { UpdateEmergencyContactDto } from '../dto/update-emergency-contact.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  async getProfile(@Req() req: any) {
    const userType = req.user.type;
    return this.profileService.getProfile(req.user.id, userType);
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    return this.profileService.getPreferences(req.user.id);
  }

  @Get('activity')
  async getActivity(@Req() req: any) {
    return this.profileService.getActivity(req.user.id);
  }

  @Get('leave-summary')
  async getLeaveSummary(@Req() req: any) {
    const userType = req.user.type;
    return this.profileService.getLeaveSummary(req.user.id, userType);
  }

  @Get('document-status')
  async getDocumentStatus(@Req() req: any) {
    const userType = req.user.type;
    return this.profileService.getDocumentStatus(req.user.id, userType);
  }

  @Get('attendance-summary')
  async getAttendanceSummary(@Req() req: any) {
    const userType = req.user.type;
    return this.profileService.getAttendanceSummary(req.user.id, userType);
  }

  @Get('session-info')
  async getSessionInfo(@Req() req: any) {
    return this.profileService.getSessionInfo(req.user.id);
  }

  @Get('completion')
  async getCompletion(@Req() req: any) {
    const userType = req.user.type;
    return this.profileService.getCompletion(req.user.id, userType);
  }

  @Put('update-personal')
  @UseGuards(RateLimit(20, 5))
  async updatePersonal(@Req() req: any, @Body() dto: UpdatePersonalDto) {
    return this.profileService.updatePersonal(req.user.id, dto, req);
  }

  @Put('update-emergency-contact')
  async updateEmergencyContact(@Req() req: any, @Body() dto: UpdateEmergencyContactDto) {
    return this.profileService.updateEmergencyContact(req.user.id, dto, req);
  }

  @Put('update-preferences')
  async updatePreferences(@Req() req: any, @Body() dto: UpdatePreferencesDto) {
    return this.profileService.updatePreferences(req.user.id, dto);
  }

  @Patch('upload-photo')
  @UseGuards(RateLimit(10, 10))
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/profile',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${req.user['id']}-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        return cb(new BadRequestException('Only JPG, JPEG, PNG, and WEBP files are allowed!'), false);
      }
      cb(null, true);
    },
  }))
  async uploadPhoto(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.profileService.uploadPhoto(req.user.id, file);
  }

  @Get('admin/audit/:userId')
  async getAdminAudit(@Req() req: any, @Param('userId', ParseIntPipe) userId: number) {
    const userType = req.user.type?.toUpperCase();
    if (userType !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
    return this.profileService.getAdminAudit(req.user.id, userId);
  }
}
