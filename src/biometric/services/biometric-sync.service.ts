import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricDevice, BiometricDeviceStatus } from '../models/biometric-device.model';
import { BiometricPunchLog, BiometricPunchStatus } from '../models/biometric-punch-log.model';
import { BiometricQueueService } from './biometric-queue.service';
import { BiometricHealthPollerService } from './biometric-health-poller.service';
import { BiometricDeviceService } from './biometric-device.service';
import { BiometricService } from './biometric.service';
import * as net from 'net';

@Injectable()
export class BiometricSyncService {
  private readonly logger = new Logger(BiometricSyncService.name);

  constructor(
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
    @InjectModel(BiometricPunchLog)
    private readonly punchLogModel: typeof BiometricPunchLog,
    private readonly deviceService: BiometricDeviceService,
    private readonly queueService: BiometricQueueService,
    private readonly healthPoller: BiometricHealthPollerService,
  ) {}

  // ─── CHECKSUM & PACKET HELPERS ───────────────────────────────────────

  private createChkSum(buf: Buffer): number {
    let chksum = 0;
    for (let i = 0; i < buf.length; i += 2) {
      if (i === buf.length - 1) {
        chksum += buf[i];
      } else {
        chksum += buf.readUInt16LE(i);
      }
      chksum %= 65535;
    }
    chksum = 65535 - chksum - 1;
    return chksum;
  }

  private buildZkTcpPacket(command: number, sessionId = 0, replyId = 0, data = Buffer.from([])): Buffer {
    const buf = Buffer.alloc(8 + data.length);
    buf.writeUInt16LE(command, 0);
    buf.writeUInt16LE(0, 2);
    buf.writeUInt16LE(sessionId, 4);
    buf.writeUInt16LE(replyId, 6);
    if (data.length > 0) data.copy(buf, 8);

    const chk = this.createChkSum(buf);
    buf.writeUInt16LE(chk, 2);

    const prefix = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x00, 0x00, 0x00, 0x00]);
    prefix.writeUInt16LE(buf.length, 4);

    return Buffer.concat([prefix, buf]);
  }

  private parseTimeToDate(time: number): Date {
    const second = time % 60;
    time = (time - second) / 60;
    const minute = time % 60;
    time = (time - minute) / 60;
    const hour = time % 24;
    time = (time - hour) / 24;
    const day = (time % 31) + 1;
    time = (time - (day - 1)) / 31;
    const month = time % 12;
    time = (time - month) / 12;
    const year = time + 2000;
    return new Date(year, month, day, hour, minute, second);
  }

  private parse40ByteAttRecord(buf: Buffer): { deviceUserId: string; timestamp: Date } {
    const deviceUserId = buf.slice(2, 11).toString('ascii').replace(/\0/g, '').trim();
    const timeNum = buf.readUInt32LE(27);
    const date = this.parseTimeToDate(timeNum);
    return { deviceUserId, timestamp: date };
  }

  private parse16ByteAttRecord(buf: Buffer): { deviceUserId: string; timestamp: Date } {
    const userId = buf.readUInt16LE(0);
    const timeNum = buf.readUInt32LE(4);
    const date = this.parseTimeToDate(timeNum);
    return { deviceUserId: String(userId), timestamp: date };
  }

  // ─── HARDWARE LOG EXTRACTION ENGINE ────────────────────────────────

  private async fetchRawHardwareLogs(ip: string, port: number, retries = 2): Promise<Array<{ deviceUserId: string; timestamp: Date; rawPayload: any }>> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.executeSingleHardwareSocketFetch(ip, port);
      } catch (err: any) {
        if (attempt < retries) {
          this.logger.warn(`[Native ZK Engine] Socket connect attempt ${attempt}/${retries} failed (${err.message}). Retrying in 1.5s to clear socket TIME_WAIT...`);
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          throw err;
        }
      }
    }
    return [];
  }

  private async executeSingleHardwareSocketFetch(ip: string, port: number): Promise<Array<{ deviceUserId: string; timestamp: Date; rawPayload: any }>> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let sessionId = 0;
      let replyId = 0;
      let expectedSize = 0;
      let totalDataBuffer = Buffer.from([]);
      let hasTriedFallback = false;

      const timeout = setTimeout(() => {
        this.logger.error(`STEP 0: EXTRACTION TIMEOUT on ${ip}:${port}. Closing socket.`);
        socket.destroy();
        reject(new Error(`Hardware extraction timeout (${ip}:${port})`));
      }, 12000);

      // STEP 1: REGISTER ALL LISTENERS BEFORE CONNECTING (PREVENTS RACE CONDITION)

      socket.on('data', (data) => {
        this.logger.log(`STEP 6: RX DATA (${data.length} bytes): ${data.toString('hex')}`);

        if (data.length >= 16 && data.compare(Buffer.from([0x50, 0x50, 0x82, 0x7d]), 0, 4, 0, 4) === 0) {
          const payload = data.slice(8);
          const commandId = payload.readUInt16LE(0);
          const respSessionId = payload.readUInt16LE(4);
          const respReplyId = payload.readUInt16LE(6);

          this.logger.log(`STEP 2: PARSED ZK TCP HEADER -> CmdID: ${commandId}, SessionID: ${respSessionId}, ReplyID: ${respReplyId}`);

          if (commandId === 2000 && sessionId === 0) {
            sessionId = respSessionId;
            replyId = respReplyId;
            this.logger.log(`STEP 2: ✅ CMD_CONNECT SUCCESS! Session ID: ${sessionId}`);

            // STEP 3: SEND ATTLOG REQUEST (CMD_DATA_WRRQ 1500)
            replyId++;
            const attLogTypeBuf = Buffer.from([0x0d, 0x00, 0x00, 0x00]);
            const reqPacket = this.buildZkTcpPacket(1500, sessionId, replyId, attLogTypeBuf);
            this.logger.log(`STEP 3: TX ATTLOG REQ (SessionID ${sessionId}, ReplyID ${replyId}): ${reqPacket.toString('hex')}`);
            socket.write(reqPacket);
            return;
          }

          if (commandId === 1503) {
            // STEP 4: PREPARE DATA ACK RECEIVED
            const sizeBuf = payload.slice(8, 12);
            expectedSize = sizeBuf.readUInt32LE(0);
            this.logger.log(`STEP 4: ✅ PREPARE DATA ACK RECEIVED! Total expected size: ${expectedSize} bytes`);

            // STEP 5: SEND CHUNK REQUEST (CMD_DATA_RDY 1504)
            replyId++;
            const chunkReqData = Buffer.alloc(8);
            chunkReqData.writeUInt32LE(0, 0);
            chunkReqData.writeUInt32LE(expectedSize, 4);

            const chunkPacket = this.buildZkTcpPacket(1504, sessionId, replyId, chunkReqData);
            this.logger.log(`STEP 5: TX CHUNK REQ (CMD_DATA_RDY 1504, Size ${expectedSize}): ${chunkPacket.toString('hex')}`);
            socket.write(chunkPacket);
            return;
          }

          if (commandId === 1500) {
            const chunkData = payload.slice(8);
            this.logger.log(`STEP 6: Chunk payload segment received: ${chunkData.length} bytes`);
            totalDataBuffer = Buffer.concat([totalDataBuffer, chunkData]);
          }
        } else if (data.length >= 2 && data[0] === 0x5a && data[1] === 0xa5) {
          this.logger.log(`STEP 2: [Realtime OEM Response] RX: ${data.toString('hex')}`);
          if (!hasTriedFallback && sessionId === 0) {
            hasTriedFallback = true;
            this.logger.log(`STEP 2: ⚠️ Device returned Realtime OEM status packet. Sending exact ZK 16-byte session init...`);
            const zkInitPkt = Buffer.from('5050827d08000000e80317fcf7ff0000', 'hex');
            this.logger.log(`STEP 2: [Fallback] TX ZK INIT: ${zkInitPkt.toString('hex')}`);
            socket.write(zkInitPkt);
          }
        } else {
          totalDataBuffer = Buffer.concat([totalDataBuffer, data]);
          this.logger.log(`STEP 6: Data stream accumulated: ${totalDataBuffer.length} / ${expectedSize} bytes`);
        }

        if (expectedSize > 0 && totalDataBuffer.length >= expectedSize) {
          this.logger.log(`STEP 6: 🎉 ALL ${totalDataBuffer.length} BYTES RECEIVED! Sending CMD_EXIT (1001)...`);
          try {
            replyId++;
            const exitPacket = this.buildZkTcpPacket(1001, sessionId, replyId);
            socket.write(exitPacket, () => {
              try { socket.end(); } catch (_) {}
            });
          } catch (_) {
            socket.destroy();
          }
        }
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        this.logger.log(`STEP 7: SOCKET CLOSED. Processing total raw buffer (${totalDataBuffer.length} bytes)...`);

        const records: Array<{ deviceUserId: string; timestamp: Date; rawPayload: any }> = [];

        if (totalDataBuffer.length > 0) {
          let offset = 4;
          while (offset + 40 <= totalDataBuffer.length) {
            try {
              const rec = this.parse40ByteAttRecord(totalDataBuffer.slice(offset, offset + 40));
              if (rec.deviceUserId && !isNaN(rec.timestamp.getTime())) {
                records.push({ ...rec, rawPayload: { rawHex: totalDataBuffer.slice(offset, offset + 40).toString('hex') } });
                this.logger.log(`STEP 7: 📌 DECODED 40-BYTE RECORD -> Device User ID: ${rec.deviceUserId}, Time: ${rec.timestamp.toISOString()}`);
              }
              offset += 40;
            } catch (e) {
              break;
            }
          }

          if (records.length === 0) {
            offset = 4;
            while (offset + 16 <= totalDataBuffer.length) {
              try {
                const rec = this.parse16ByteAttRecord(totalDataBuffer.slice(offset, offset + 16));
                if (rec.deviceUserId && !isNaN(rec.timestamp.getTime())) {
                  records.push({ ...rec, rawPayload: { rawHex: totalDataBuffer.slice(offset, offset + 16).toString('hex') } });
                  this.logger.log(`STEP 7: 📌 DECODED 16-BYTE RECORD -> Device User ID: ${rec.deviceUserId}, Time: ${rec.timestamp.toISOString()}`);
                }
                offset += 16;
              } catch (e) {
                break;
              }
            }
          }
        }

        resolve(records);
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.error(`[Native ZK Engine] Socket error on ${ip}:${port}: ${err.message}`);
        reject(err);
      });

      // STEP 1 CONNECT (CALL LAST, AFTER REGISTERING ALL LISTENERS)
      this.logger.log(`STEP 1: CONNECTING to ${ip}:${port}...`);
      socket.connect(port, ip, () => {
        this.logger.log(`STEP 1: CONNECTED to ${ip}:${port}. TX CMD_CONNECT (1000)...`);
        const connectPacket = Buffer.from('5050827d08000000e80317fcf7ff0000', 'hex');
        this.logger.log(`STEP 1: TX CMD_CONNECT: ${connectPacket.toString('hex')}`);
        socket.write(connectPacket);
      });
    });
  }

  // ─── MAIN SYNC FUNCTION ─────────────────────────────────────────────

  async syncDevice(companyId: number, deviceId: number, biometricService?: BiometricService) {
    const startTime = Date.now();
    this.logger.log(`Manual Sync Started: Device ID ${deviceId} (Company ID: ${companyId})`);

    // 1. Fetch Device
    const device = await this.deviceService.getDeviceById(companyId, deviceId);
    if (!device) {
      throw new NotFoundException(`Biometric device with ID ${deviceId} not found`);
    }

    const previousStatus = device.status;
    await device.update({ status: BiometricDeviceStatus.SYNCING });

    let hardwareLogsCount = 0;
    let newPunchesIngested = 0;

    try {
      BiometricHealthPollerService.isSyncing = true;
      const port = device.port || 4370;
      this.logger.log(`Initiating Native ZK Protocol Sync: ${device.name} (${device.ipAddress}:${port})...`);

      // Extract hardware records directly from device memory
      const rawHardwareRecords = await this.fetchRawHardwareLogs(device.ipAddress, port);
      hardwareLogsCount = rawHardwareRecords.length;

      this.logger.log(`Extracted ${hardwareLogsCount} valid attendance logs directly from F12 hardware memory.`);

      if (hardwareLogsCount > 0) {
        const punchesToIngest = rawHardwareRecords.map((log) => ({
          companyId: device.companyId,
          deviceSerialNumber: device.serialNumber,
          deviceLogId: `${log.deviceUserId}-${log.timestamp.getTime()}`,
          biometricUserId: log.deviceUserId,
          timestamp: log.timestamp,
          serverReceivedTime: new Date(),
          punchType: 'GENERIC',
          status: BiometricPunchStatus.PENDING,
          priority: 'HIGH',
          correlationId: `SYNC-${Date.now()}`,
          rawPayload: log.rawPayload,
        }));

        // Ingest into database using Sequelize bulkCreate with ignoreDuplicates
        const result = await this.punchLogModel.bulkCreate(punchesToIngest, {
          ignoreDuplicates: true,
        });

        newPunchesIngested = result.filter((r) => r.id).length;
        this.logger.log(`Ingested ${newPunchesIngested} new punch logs into database (${hardwareLogsCount - newPunchesIngested} duplicates skipped).`);
      }

      // Trigger immediate queue processing for company
      this.logger.log(`Triggering pipeline queue processing...`);
      await this.queueService.processQueue(companyId);

      // Gather detailed metrics for response
      const recordsRead = hardwareLogsCount || await this.punchLogModel.count({
        where: { companyId, deviceSerialNumber: device.serialNumber },
      });

      const recordsImported = await this.punchLogModel.count({
        where: {
          companyId,
          deviceSerialNumber: device.serialNumber,
          status: BiometricPunchStatus.SUCCESS,
        },
      });

      const mappedCount = recordsImported;

      const unknownUsers = await this.punchLogModel.count({
        where: {
          companyId,
          deviceSerialNumber: device.serialNumber,
          status: BiometricPunchStatus.UNKNOWN_USER,
        },
      });

      const duplicatesSkipped = (hardwareLogsCount > 0 ? (hardwareLogsCount - newPunchesIngested) : 0);

      // Update device lastSyncTime & set status to ONLINE
      await device.update({
        lastSyncTime: new Date(),
        status: BiometricDeviceStatus.ONLINE,
      });

      const elapsedTimeMs = Date.now() - startTime;

      this.logger.log(`====================================================`);
      this.logger.log(`BIOMETRIC SYNC PIPELINE SUMMARY`);
      this.logger.log(`====================================================`);
      this.logger.log(`Device Name:                       ${device.name}`);
      this.logger.log(`Hardware Logs Read:                ${hardwareLogsCount}`);
      this.logger.log(`New Punches Ingested:              ${newPunchesIngested}`);
      this.logger.log(`Duplicates Skipped:                ${duplicatesSkipped}`);
      this.logger.log(`Mapped & Processed Attendance:     ${mappedCount}`);
      this.logger.log(`Unknown Users Flagged:             ${unknownUsers}`);
      this.logger.log(`Processing Latency:                ${elapsedTimeMs}ms`);
      this.logger.log(`====================================================`);

      return {
        success: true,
        device: device.name,
        recordsRead,
        recordsImported: newPunchesIngested || recordsImported,
        mapped: mappedCount,
        unknownUsers,
        duplicatesSkipped,
        processingTime: `${elapsedTimeMs}ms`,
      };
    } catch (err: any) {
      this.logger.error(`Manual sync failed for device ID ${deviceId}: ${err.message}`, err.stack);
      await device.update({ status: previousStatus });
      throw err;
    } finally {
      BiometricHealthPollerService.isSyncing = false;
    }
  }
}
