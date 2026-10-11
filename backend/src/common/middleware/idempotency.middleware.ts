import {
  Injectable,
  NestMiddleware,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly IDEMPOTENCY_HEADER = 'idempotency-key';
  private readonly EXPIRY_HOURS = 24;

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS'
    ) {
      return next();
    }

    const idempotencyKey = req.header(this.IDEMPOTENCY_HEADER);

    if (!idempotencyKey) {
      return next();
    }

    if (!this.isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException(
        'Idempotency-Key must be a valid UUID or unique string (min 16 characters)',
      );
    }

    const userId = (req as any).user?.userId || 'anonymous';
    const compositeKey = `${req.path}:${userId}:${idempotencyKey}`.slice(0, 255);

    try {
      const existing = await this.prisma.idempotency_keys.findUnique({
        where: { key: compositeKey },
      });

      if (existing) {
        return res.status(409).json({
          message: 'Request already processed',
          idempotencyKey,
          originalStatusCode: (existing.response as any)?.statusCode ?? 200,
          originalResponse:
            (existing.response as any)?.body ?? existing.response,
        });
      }

      const originalJson = res.json.bind(res);
      let responseCaptured = false;

      res.json = (body: any) => {
        if (!responseCaptured) {
          responseCaptured = true;
          this.cacheResponse(compositeKey, res.statusCode, body);
        }
        return originalJson(body);
      };

      next();
    } catch {
      next();
    }
  }

  private async cacheResponse(key: string, statusCode: number, body: any) {
    if (statusCode >= 400) return;
    try {
      const expiresAt = new Date(Date.now() + this.EXPIRY_HOURS * 3600 * 1000);
      await this.prisma.idempotency_keys.upsert({
        where: { key },
        create: {
          key,
          status: 'processed',
          response: { statusCode, body },
          expires_at: expiresAt,
        },
        update: {
          status: 'processed',
          response: { statusCode, body },
          expires_at: expiresAt,
        },
      });
    } catch (e) {
      console.warn('Could not cache idempotency key:', e);
    }
  }

  private isValidIdempotencyKey(key: string): boolean {
    return typeof key === 'string' && key.trim().length >= 16;
  }
}
