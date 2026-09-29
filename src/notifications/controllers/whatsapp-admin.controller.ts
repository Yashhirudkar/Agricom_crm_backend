import {
  Controller,
  Get,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationRetryWorker } from '../services/notification-retry.worker';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

/**
 * WhatsApp admin endpoints.
 *
 * All routes require:
 *   - Valid JWT (JwtAuthGuard)
 *   - notification:manage permission (PermissionsGuard)
 *   - Super Admin role for sensitive routes (QR, status)
 *
 * Endpoints:
 *   GET /api/whatsapp/status   → connection status (super_admin only)
 *   GET /api/whatsapp/qr       → current QR string  (super_admin only)
 *   GET /api/whatsapp/stats    → notification log stats (admin+)
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('whatsapp')
export class WhatsAppAdminController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly retryWorker: NotificationRetryWorker,
  ) {}

  // ─── Super Admin only ─────────────────────────────────────────────────────────

  /**
   * GET /api/whatsapp/status
   *
   * Returns current WhatsApp connection state.
   * 🔒 Super Admin only — exposes internal state.
   */
  @Get('status')
  @RequirePermission('notification:manage')
  getStatus(@Req() req: any) {
    this.requireSuperAdmin(req);

    return {
      connected: this.whatsAppService.isConnected(),
      connectionState: this.whatsAppService.getConnectionState(),
      resolvedGroupJid: this.whatsAppService.getResolvedGroupJid(),
      hasQr: !!this.whatsAppService.getCurrentQr(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/whatsapp/qr
   *
   * Returns the raw QR string for frontend rendering.
   * 🔒 Super Admin ONLY — a QR code allows anyone to link this WhatsApp account.
   *
   * Frontend usage:
   *   Pass the returned `qr` string to any QR renderer (e.g. qrcode.js).
   *   The user then scans it via WhatsApp → Linked Devices.
   *
   * QR is only valid for ~60 seconds after generation.
   * If null, WhatsApp is already connected (or WHATSAPP_ENABLED=false).
   */
  @Get('qr')
  @RequirePermission('notification:manage')
  getQr(@Req() req: any) {
    this.requireSuperAdmin(req);

    const qr = this.whatsAppService.getCurrentQr();
    return {
      hasQr: !!qr,
      qr: qr ?? null,
      instructions: qr
        ? 'Render `qr` with a QR code library and scan via WhatsApp → Linked Devices. Valid ~60s.'
        : 'No QR available — WhatsApp may already be connected or WHATSAPP_ENABLED=false.',
    };
  }

  // ─── Admin (notification:manage) ─────────────────────────────────────────────

  /**
   * GET /api/whatsapp/stats
   *
   * Returns notification_logs row counts grouped by status.
   * Useful for admin dashboards to monitor delivery health.
   *
   * Response: { pending: N, success: N, failed: N, exhausted: N }
   */
  @Get('stats')
  @RequirePermission('notification:manage')
  async getStats() {
    const stats = await this.retryWorker.getStats();
    return { success: true, data: stats };
  }

  // ─── Private guards ───────────────────────────────────────────────────────────

  /**
   * Throws 403 ForbiddenException if the requesting user is not a super_admin.
   * Must be called at the start of any super-admin-only action.
   */
  private requireSuperAdmin(req: any): void {
    const isSuperAdmin =
      req.user?.type === 'super_admin' ||
      req.user?.role === 'super_admin';

    if (!isSuperAdmin) {
      throw new ForbiddenException(
        'This action requires Super Admin privileges',
      );
    }
  }
}
