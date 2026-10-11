import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly store = new Map<string, RateLimitRecord>();

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitConfig = this.reflector.get<{
      limit: number;
      windowMs: number;
    }>(RATE_LIMIT_KEY, context.getHandler());

    if (!rateLimitConfig) {
      return true;
    }

    const { limit, windowMs } = rateLimitConfig;
    const request = context.switchToHttp().getRequest<Request>();

    const userId = (request as any).user?.userId || (request as any).user?.sub;
    const identifier = userId || this.getClientIp(request);

    const endpoint = `${request.method}:${request.route?.path || request.path}`;
    const key = `${endpoint}:${identifier}`;
    const now = Date.now();

    try {
      const record = RateLimitGuard.store.get(key);

      if (!record || now > record.resetAt) {
        RateLimitGuard.store.set(key, {
          count: 1,
          resetAt: now + windowMs,
        });

        this.setRateLimitHeaders(context, limit, limit - 1, windowMs);
        return true;
      }

      if (record.count >= limit) {
        const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);

        this.setRateLimitHeaders(
          context,
          limit,
          0,
          windowMs,
          retryAfterSeconds,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Rate limit exceeded. Too many requests to ${endpoint}. Try again in ${retryAfterSeconds} seconds.`,
            error: 'Too Many Requests',
            retryAfter: retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      record.count += 1;
      const remaining = limit - record.count;
      this.setRateLimitHeaders(context, limit, remaining, windowMs);

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('[RateLimit] Error checking rate limit:', error);
      return true;
    }
  }

  private setRateLimitHeaders(
    context: ExecutionContext,
    limit: number,
    remaining: number,
    windowMs: number,
    retryAfter?: number,
  ) {
    const response = context.switchToHttp().getResponse();

    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(Date.now() / 1000 + windowMs / 1000),
    );

    if (retryAfter !== undefined) {
      response.setHeader('Retry-After', retryAfter);
    }
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.header('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIp = request.header('x-real-ip');
    if (realIp) {
      return realIp;
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
