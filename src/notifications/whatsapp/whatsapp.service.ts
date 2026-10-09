import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppConfig } from './whatsapp.types';
import { Company } from '../../companies/models/company.model';
import { NotificationLog } from '../models/notification-log.model';

// Baileys is ESM-only — always imported dynamically at runtime
type WASocket = any;

/**
 * WhatsAppService — the ONLY class that directly touches Baileys.
 *
 * Responsibilities:
 *  - Connection lifecycle (connect / disconnect / auto-reconnect)
 *  - QR code handling: print to terminal + save to file + expose via getter
 *  - Group JID resolution by name (groupFetchAllParticipating)
 *  - Low-level sendText(jid, text)
 *
 * What it does NOT do:
 *  - Build message templates (→ WhatsAppTemplates)
 *  - Decide which group to send to (→ NotificationDispatchService)
 *  - Log to DB (→ NotificationDispatchService)
 *  - Know about business entities (Enquiry, Quotation, etc.)
 */
@Injectable()
export class WhatsAppService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly config: WhatsAppConfig;

  private sock: WASocket | null = null;
  private isReady = false;
  private currentQr: string | null = null;
  private resolvedGroupJid: string | null = null;
  private cleanupInProgress = false;

  // Track specific state for frontend
  private connectionState:
    | 'CONNECTED'
    | 'CONNECTING'
    | 'WAITING_FOR_QR'
    | 'LOGGED_OUT'
    | 'RECONNECTING' = 'CONNECTING';

  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private readonly MAX_RECONNECT_DELAY_MS = 30_000;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      enabled: this.configService.get<string>('WHATSAPP_ENABLED') === 'true',
      sessionPath:
        this.configService.get<string>('WHATSAPP_SESSION_PATH') ||
        'storage/whatsapp',
      groupName: this.configService.get<string>('WHATSAPP_GROUP_NAME') || '',
      groupId: this.configService.get<string>('WHATSAPP_GROUP_ID') || '',
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      console.log(
        '[WhatsApp] Disabled via WHATSAPP_ENABLED=false — skipping init',
      );
      return;
    }
    await this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }

  // ─── Public API (for WhatsAppAdminController + NotificationDispatchService) ─

  isConnected(): boolean {
    return this.isReady;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  /** Returns the raw QR string (can be rendered by frontend or saved externally). */
  getCurrentQr(): string | null {
    return this.currentQr;
  }

  /**
   * Returns the resolved group JID.
   * Priority:
   *  1. Env WHATSAPP_GROUP_ID (explicit JID)
   *  2. Resolved from WHATSAPP_GROUP_NAME after connection is open
   */
  getResolvedGroupJid(): string | null {
    return this.resolvedGroupJid;
  }

  /**
   * Sends a text message to any WhatsApp JID (individual or group).
   * Returns true on success, false on any failure.
   * Never throws — all errors are caught and logged.
   */
  async sendText(jid: string, text: string): Promise<boolean> {
    if (!this.isReady || !this.sock) {
      this.logger.warn('[WhatsApp] Cannot send — socket not ready');
      return false;
    }
    try {
      await this.sock.sendMessage(jid, { text });
      this.logger.log(
        `[WhatsApp] ✅ Message sent → ${jid} at ${new Date().toISOString()}`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(
        `[WhatsApp] ❌ sendText failed → ${jid}: ${err?.message || err}`,
        err?.stack,
      );
      return false;
    }
  }

  // ─── Connection Management ─────────────────────────────────────────────────

  async connect(): Promise<void> {
    try {
      this.connectionState =
        this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING';
      console.log('[WhatsApp] Initializing...');

      console.log('[WhatsApp] Loading Baileys module...');
      // Bypass TypeScript compiling import() into require() which fails for ESM
      const baileysModule = await new Function(
        'return import("@whiskeysockets/baileys")',
      )();
      const baileys = baileysModule.default ? baileysModule : baileysModule;

      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
      } = baileys;

      console.log(`[WhatsApp] Session Path: \n${this.config.sessionPath}`);
      // Ensure session dir exists
      await fs.promises.mkdir(this.config.sessionPath, { recursive: true });

      console.log('[WhatsApp] Loading auth state...');
      const { state, saveCreds } = await useMultiFileAuthState(
        this.config.sessionPath,
      );

      let version: any;
      try {
        console.log('[WhatsApp] Fetching latest Baileys version...');
        const result = await fetchLatestBaileysVersion();
        version = result.version;
        console.log(`[WhatsApp] Using WA Web version: ${version?.join('.')}`);
      } catch (versionErr) {
        this.logger.warn(
          '[WhatsApp] Could not fetch latest version — using bundled default',
        );
        version = undefined;
      }

      console.log('[WhatsApp] Creating socket...');
      this.sock = makeWASocket({
        version,
        auth: state,
        logger: this._buildSilentLogger(),
        browser: ['Agricom CRM', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        // ── QR generated ───────────────────────────────────────────────────
        if (qr) {
          this.currentQr = qr;
          this.connectionState = 'WAITING_FOR_QR';
          console.log('[WhatsApp] Waiting for QR...');
          console.log(
            `[WhatsApp] 📱 QR generated at ${new Date().toISOString()} ` +
              `— GET /api/whatsapp/qr to retrieve, or scan from terminal`,
          );
          await this._saveQrToFile(qr);
        }

        // ── Connected ──────────────────────────────────────────────────────
        if (connection === 'open') {
          this.isReady = true;
          this.currentQr = null;
          this.reconnectAttempt = 0;
          this.connectionState = 'CONNECTED';
          console.log('[WhatsApp] Connected successfully.');
          // Resolve group JID after connection is confirmed
          await this._resolveAndCacheGroupJid();
          // Remove stale QR file
          await this._deleteQrFile();
        }

        // ── Disconnected ───────────────────────────────────────────────────
        if (connection === 'close') {
          this.isReady = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const reason = this._disconnectLabel(statusCode);
          this.logger.warn(
            `[WhatsApp] ⚠️ Connection closed — ${reason} (code ${statusCode})`,
          );

          if (
            statusCode === DisconnectReason?.loggedOut ||
            statusCode === 401 ||
            statusCode === 403 // sometimes credentials revoked returns 403
          ) {
            await this._handleLogoutCleanup();
            return;
          }

          this._scheduleReconnect();
        }
      });
    } catch (err: any) {
      this.logger.error('WhatsApp initialization failed', err?.stack);
      this.logger.error(err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // swallow during shutdown
      }
      this.sock = null;
      this.isReady = false;
      this.logger.log('[WhatsApp] Disconnected gracefully');
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _handleLogoutCleanup(): Promise<void> {
    if (this.cleanupInProgress) return;
    this.cleanupInProgress = true;

    try {
      this.connectionState = 'LOGGED_OUT';
      this.logger.log('[WhatsApp] Device logged out.');
      this.logger.log('[WhatsApp] Cleaning auth session...');

      // Clear in-memory state
      this.isReady = false;
      this.currentQr = null;
      this.resolvedGroupJid = null;

      if (this.sock) {
        try {
          this.sock.end(undefined);
        } catch {
          // swallow during cleanup
        }
        this.sock = null;
      }

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Delete session directory fully recursive
      try {
        await fs.promises.rm(this.config.sessionPath, {
          recursive: true,
          force: true,
        });
        await fs.promises.mkdir(this.config.sessionPath, { recursive: true });
        this.logger.log('[WhatsApp] Session deleted.');
      } catch (err: any) {
        this.logger.error(
          `[WhatsApp] Failed to delete session files: ${err?.message}`,
        );
      }

      // Set whatsappConnectedAt = null for all companies
      try {
        await Company.update({ whatsappConnectedAt: null }, { where: {} });
      } catch (err: any) {
        this.logger.error(
          `[WhatsApp] Failed to update Company records: ${err?.message}`,
        );
      }

      // Save debug log to DB
      try {
        await NotificationLog.create({
          entityType: 'WhatsApp',
          entityId: 'SYSTEM',
          template: 'SYSTEM_EVENT',
          channel: 'WHATSAPP',
          recipient: 'SYSTEM',
          status: 'success',
          payload: {
            status: 'Disconnected',
            reason: 'Logged Out',
            action: 'New QR Generated',
          },
          response: 'Session cleaned up successfully.',
        } as any);
      } catch (err: any) {
        this.logger.warn(
          `[WhatsApp] Failed to write audit log: ${err?.message}`,
        );
      }

      this.logger.log('[WhatsApp] Waiting for new QR...');

      // Auto recovery: immediate reconnect attempt
      this.reconnectAttempt = 0;
      this._scheduleReconnect(0);
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private async _resolveAndCacheGroupJid(): Promise<void> {
    // Explicit JID takes priority
    if (this.config.groupId) {
      this.resolvedGroupJid = this.config.groupId;
      this.logger.log(
        `[WhatsApp] Using explicit group JID from env: ${this.resolvedGroupJid}`,
      );
      return;
    }

    // Resolve by name
    if (this.config.groupName && this.sock) {
      const jid = await this.resolveGroupJidByName(this.config.groupName);
      if (jid) {
        this.resolvedGroupJid = jid;
        this.logger.log(
          `[WhatsApp] ✅ Global Group resolved: "${this.config.groupName}" → ${jid}`,
        );
      }
    }
  }

  /**
   * Resolves a group JID by its subject (name).
   */
  async resolveGroupJidByName(groupName: string): Promise<string | null> {
    if (!this.sock || !this.isReady) {
      this.logger.warn(
        `[WhatsApp] Cannot resolve group "${groupName}" — socket not ready`,
      );
      return null;
    }

    try {
      const groups = await this.sock.groupFetchAllParticipating();
      const entries = Object.values(groups) as any[];
      const match = entries.find(
        (g) =>
          g.subject?.toLowerCase().trim() === groupName.toLowerCase().trim(),
      );

      if (match) {
        return match.id;
      } else {
        const names = entries.map((g) => `"${g.subject}"`).join(', ');
        this.logger.warn(
          `[WhatsApp] Group "${groupName}" not found. ` +
            `Available groups: ${names || 'none'}`,
        );
        return null;
      }
    } catch (err: any) {
      this.logger.warn(
        `[WhatsApp] Could not fetch groups to resolve "${groupName}": ${err?.message}`,
      );
      return null;
    }
  }

  private async _saveQrToFile(qr: string): Promise<void> {
    try {
      const filePath = path.join(this.config.sessionPath, 'latest-qr.txt');
      await fs.promises.writeFile(filePath, qr, 'utf-8');
      this.logger.log(`[WhatsApp] QR string saved → ${filePath}`);
    } catch (err: any) {
      this.logger.warn(`[WhatsApp] Could not save QR to file: ${err?.message}`);
    }
  }

  private async _deleteQrFile(): Promise<void> {
    try {
      const filePath = path.join(this.config.sessionPath, 'latest-qr.txt');
      await fs.promises.unlink(filePath);
    } catch {
      // File may not exist — ignore
    }
  }

  private _scheduleReconnect(customDelayMs?: number): void {
    const delay =
      customDelayMs !== undefined
        ? customDelayMs
        : Math.min(
            1_000 * 2 ** this.reconnectAttempt,
            this.MAX_RECONNECT_DELAY_MS,
          );

    if (customDelayMs === undefined) {
      this.reconnectAttempt++;
    }

    this.logger.log(
      `[WhatsApp] 🔄 Reconnecting in ${delay / 1000}s (attempt #${this.reconnectAttempt})…`,
    );
    this.reconnectTimer = setTimeout(
      async () => {
        this.reconnectTimer = null;
        await this.connect();
      },
      Math.max(delay, 500),
    ); // Ensure at least 500ms delay to prevent event loop blocking
  }

  private _disconnectLabel(code?: number): string {
    const map: Record<number, string> = {
      401: 'Unauthorized / Logged out',
      403: 'Forbidden',
      408: 'Timed out',
      428: 'Connection closed',
      440: 'Connection replaced',
      500: 'Internal server error',
      515: 'Restart required',
    };
    return code ? (map[code] ?? `Unknown (${code})`) : 'Unknown';
  }

  /** Dynamic ESM import wrapper — allows mocking in tests */
  private async _importBaileys(): Promise<any> {
    return import('@whiskeysockets/baileys');
  }

  /**
   * Minimal pino-compatible logger.
   * Silences Baileys' verbose debug output while routing warn/error through NestJS.
   */
  private _buildSilentLogger(): any {
    const self = this;
    const toStr = (v: any) => {
      if (v instanceof Error) {
        return `${v.name}: ${v.message}\n${v.stack}`;
      }
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v, Object.getOwnPropertyNames(v));
        } catch {
          return String(v);
        }
      }
      return String(v);
    };

    const handleLog =
      (level: 'warn' | 'error') =>
      (...args: any[]) => {
        const msg = args.map((a) => toStr(a)).join(' ');
        self.logger[level](msg);
      };

    return {
      level: 'silent',
      info: () => {
        /* suppressed */
      },
      debug: () => {
        /* suppressed */
      },
      trace: () => {
        /* suppressed */
      },
      warn: handleLog('warn'),
      error: handleLog('error'),
      child: () => self._buildSilentLogger(),
    };
  }
}
