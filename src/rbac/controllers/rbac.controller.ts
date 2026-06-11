import { Controller, Post, Get, Body, Query, UseGuards, ParseIntPipe, HttpCode, HttpStatus, Request, ForbiddenException } from '@nestjs/common';
import { RbacService } from '../services/rbac.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { DeleteRoleDto } from '../dto/delete-role.dto';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { DeletePermissionDto } from '../dto/delete-permission.dto';
import { AssignPermissionToRoleDto } from '../dto/assign-permission-to-role.dto';
import { RemovePermissionFromRoleDto } from '../dto/remove-permission-from-role.dto';
import { AssignRoleToUserDto } from '../dto/assign-role-to-user.dto';
import { RemoveRoleFromUserDto } from '../dto/remove-role-from-user.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // ──────────────────────────────────────────────
  //  ROLES
  // ──────────────────────────────────────────────

  @Post('CreateRole')
  @RequirePermission('roles:create')
  @HttpCode(HttpStatus.CREATED)
  createRole(@Body() dto: CreateRoleDto, @Request() req) {
    const isSuper = req.user.type === 'super_admin';
    const clientId = isSuper ? dto.clientId : req.user.clientId;
    const isSystemRole = isSuper ? (dto.isSystemRole || false) : false;

    return this.rbacService.createRole({
      ...dto,
      clientId,
      isSystemRole,
    });
  }

  @Post('UpdateRole')
  @RequirePermission('roles:update')
  @HttpCode(HttpStatus.OK)
  async updateRole(@Body() dto: UpdateRoleDto, @Request() req) {
    const isSuper = req.user.type === 'super_admin';
    if (!isSuper) {
      const role = await this.rbacService.getRoleById(dto.id);
      if (role.clientId !== req.user.clientId) {
        throw new ForbiddenException('You can only update your own client roles');
      }
    }
    return this.rbacService.updateRole(dto);
  }

  @Post('DeleteRole')
  @RequirePermission('roles:delete')
  @HttpCode(HttpStatus.OK)
  async deleteRole(@Body() dto: DeleteRoleDto, @Request() req) {
    const isSuper = req.user.type === 'super_admin';
    if (!isSuper) {
      const role = await this.rbacService.getRoleById(dto.id);
      if (role.clientId !== req.user.clientId) {
        throw new ForbiddenException('You can only delete your own client roles');
      }
    }
    return this.rbacService.deleteRole(dto.id);
  }

  @Get('GetRoles')
  @RequirePermission('roles:read')
  getRoles(@Request() req, @Query('clientId') filterClientId?: string) {
    const isSuper = req.user.type === 'super_admin';
    const clientId = isSuper
      ? (filterClientId ? parseInt(filterClientId, 10) : null)
      : req.user.clientId;

    return this.rbacService.getRoles(clientId);
  }

  @Get('GetRoleById')
  @RequirePermission('roles:read')
  async getRoleById(@Query('id', ParseIntPipe) id: number, @Request() req) {
    const role = await this.rbacService.getRoleById(id);
    const isSuper = req.user.type === 'super_admin';
    if (!isSuper && role.clientId !== null && role.clientId !== req.user.clientId) {
      throw new ForbiddenException('Access denied');
    }
    return role;
  }

  // ──────────────────────────────────────────────
  //  PERMISSIONS
  // ──────────────────────────────────────────────

  @Post('CreatePermission')
  @RequirePermission('permissions:create')
  @HttpCode(HttpStatus.CREATED)
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.rbacService.createPermission(dto);
  }

  @Post('UpdatePermission')
  @RequirePermission('permissions:update')
  @HttpCode(HttpStatus.OK)
  updatePermission(@Body() dto: UpdatePermissionDto) {
    return this.rbacService.updatePermission(dto);
  }

  @Post('DeletePermission')
  @RequirePermission('permissions:delete')
  @HttpCode(HttpStatus.OK)
  deletePermission(@Body() dto: DeletePermissionDto) {
    return this.rbacService.deletePermission(dto.id);
  }

  @Get('GetPermissions')
  @RequirePermission('permissions:read')
  getPermissions() {
    return this.rbacService.getPermissions();
  }

  @Get('GetPermissionById')
  @RequirePermission('permissions:read')
  getPermissionById(@Query('id', ParseIntPipe) id: number) {
    return this.rbacService.getPermissionById(id);
  }

  // ──────────────────────────────────────────────
  //  ROLE ↔ PERMISSION
  // ──────────────────────────────────────────────

  @Post('AssignPermissionToRole')
  @RequirePermission('roles:assign-permission')
  @HttpCode(HttpStatus.OK)
  assignPermissionToRole(@Body() dto: AssignPermissionToRoleDto) {
    return this.rbacService.assignPermissionToRole(dto);
  }

  @Post('RemovePermissionFromRole')
  @RequirePermission('roles:assign-permission')
  @HttpCode(HttpStatus.OK)
  removePermissionFromRole(@Body() dto: RemovePermissionFromRoleDto) {
    return this.rbacService.removePermissionFromRole(dto);
  }

  @Get('GetRolePermissions')
  @RequirePermission('roles:read')
  getRolePermissions(@Query('roleId', ParseIntPipe) roleId: number) {
    return this.rbacService.getRolePermissions(roleId);
  }

  @Post('UpdateRolePermissions')
  @RequirePermission('roles:assign-permission')
  @HttpCode(HttpStatus.OK)
  updateRolePermissions(@Body() dto: { roleId: number; permissionIds: number[] }) {
    return this.rbacService.updateRolePermissions(dto.roleId, dto.permissionIds);
  }

  // ──────────────────────────────────────────────
  //  USER ↔ ROLE
  // ──────────────────────────────────────────────

  @Post('AssignRoleToUser')
  @RequirePermission('users:assign-role')
  @HttpCode(HttpStatus.OK)
  assignRoleToUser(@Body() dto: AssignRoleToUserDto) {
    return this.rbacService.assignRoleToUser(dto);
  }

  @Post('RemoveRoleFromUser')
  @RequirePermission('users:assign-role')
  @HttpCode(HttpStatus.OK)
  removeRoleFromUser(@Body() dto: RemoveRoleFromUserDto) {
    return this.rbacService.removeRoleFromUser(dto);
  }

  @Get('GetUserRoles')
  @RequirePermission('users:read')
  getUserRoles(@Query('userId', ParseIntPipe) userId: number) {
    return this.rbacService.getUserRoles(userId);
  }
}
