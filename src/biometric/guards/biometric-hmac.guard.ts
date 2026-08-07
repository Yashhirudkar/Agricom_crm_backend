import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BiometricDevice } from '../models/biometric-device.model';
import * as crypto from 'crypto';

@Injectable()
export class BiometricHmacGuard implements CanActivate {
  // TTL cache for nonces to prevent replay attacks.
  // Storing (nonce -> expiryTimestamp) in memory.
  private static processedNonces = new Map<string, number>();

  constructor(
    @InjectModel(BiometricDevice)
    private readonly deviceModel: typeof BiometricDevice,
  ) {
    // Schedule cleanups for expired nonces
    setInterval(() => {
      const now = Date.now();
      for (const [nonce, expiry] of BiometricHmacGuard.processedNonces.entries()) {
        if (now > expiry) {
          BiometricHmacGuard.processedNonces.delete(nonce);
        }
      }
    }, 60 * 1000); // cleanup every 1 minute
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const serialNumber = request.headers['x-device-serial'];
    const timestampStr = request.headers['x-timestamp'];
    const nonce = request.headers['x-nonce'];
    const signature = request.headers['x-signature'];

    if (!serialNumber || !timestampStr || !nonce || !signature) {
      throw new UnauthorizedException('Missing biometric authentication headers');
    }

    // 1. Fetch Device from DB
    const device = await this.deviceModel.findOne({
      where: { serialNumber, isActive: true },
    });

    if (!device) {
      throw new UnauthorizedException('Biometric device not registered or inactive');
    }

    // 2. Verify timestamp window (5 minutes)
    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    if (isNaN(timestamp) || Math.abs(now - timestamp) > WINDOW_MS) {
      throw new UnauthorizedException('Request timestamp expired or out of sync');
    }

    // 3. Verify Nonce to prevent replay attacks
    if (BiometricHmacGuard.processedNonces.has(nonce)) {
      throw new UnauthorizedException('Duplicate request nonce detected (replay attack)');
    }

    // Cache the nonce until its timestamp is no longer valid (5 mins max)
    BiometricHmacGuard.processedNonces.set(nonce, timestamp + WINDOW_MS);

    // 4. Compute and verify HMAC-SHA256 Signature
    // String to sign: timestamp.nonce.bodyString
    const bodyStr = request.body ? JSON.stringify(request.body) : '';
    const stringToSign = `${timestampStr}.${nonce}.${bodyStr}`;

    const computedSignature = crypto
      .createHmac('sha256', device.secretKey)
      .update(stringToSign)
      .digest('hex');

    if (computedSignature !== signature) {
      throw new UnauthorizedException('Invalid biometric request signature');
    }

    // 5. Attach device context to request
    request.device = device;
    request.companyId = device.companyId;

    return true;
  }
}
