import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ClientsService } from '../services/clients.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateClientDto, UpdateClientDto, DeleteClientDto } from '../dto/clients.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('/GetClients')
  @RequirePermission('clients:read')
  async getClients(@Request() req) {
    if (req.user.type !== 'super_admin') throw new ForbiddenException('Super Admin only');
    return this.clientsService.findAll();
  }

  @Post('/CreateClient')
  @RequirePermission('clients:create')
  @HttpCode(HttpStatus.CREATED)
  async createClient(@Body() data: CreateClientDto, @Request() req) {
    if (req.user.type !== 'super_admin') throw new ForbiddenException('Super Admin only');
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const client = await this.clientsService.create(data, actor);
    const { password, ...safeClient } = (client as any).toJSON();
    return safeClient;
  }

  @Post('/UpdateClient')
  @RequirePermission('clients:update')
  @HttpCode(HttpStatus.OK)
  async updateClient(@Body() data: UpdateClientDto, @Request() req) {
    if (req.user.type !== 'super_admin') throw new ForbiddenException('Super Admin only');
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const client = await this.clientsService.update(data.id, data, actor);
    const { password, ...safeClient } = (client as any).toJSON();
    return safeClient;
  }

  @Post('/DeleteClient')
  @RequirePermission('clients:delete')
  @HttpCode(HttpStatus.OK)
  async deleteClient(@Body() data: DeleteClientDto, @Request() req) {
    if (req.user.type !== 'super_admin') throw new ForbiddenException('Super Admin only');
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    await this.clientsService.delete(data.id, actor);
    return { id: data.id };
  }
}
