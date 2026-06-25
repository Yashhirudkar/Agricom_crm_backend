import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface RateLimitRule {
  limit: number;
  windowMs: number; // e.g. 15 * 60 * 1000 for 15 min
}

// In-memory store: Map<IP_ACTION, number[]> (Array of timestamps)
const rateLimitStore = new Map<string, number[]>();

export function RateLimit(limit: number, windowMinutes: number) {
  @Injectable()
  class RateLimitMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const ip = request.ip || request.connection.remoteAddress || 'unknown';
      const action = request.route.path; // e.g. /profile/update-personal

      const key = `${ip}_${action}`;
      const now = Date.now();
      const windowMs = windowMinutes * 60 * 1000;

      let requests = rateLimitStore.get(key) || [];

      // Filter out old requests
      requests = requests.filter((timestamp) => now - timestamp < windowMs);

      if (requests.length >= limit) {
        throw new HttpException(
          'Too Many Requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      requests.push(now);
      rateLimitStore.set(key, requests);

      return true;
    }
  }

  return RateLimitMixin;
}
