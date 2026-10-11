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
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Rate Limiting Guard
 *
 * CRITICAL: Prevent abuse, brute-force attacks, and resource exhaustion.
 *
 * WHAT IT DOES:
 * 1. Tracks requests per IP/user
 * 2. Blocks requests exceeding limit
 * 3. Returns 429 Too Many Requests with Retry-After header
 * 4. Supports different limits per endpoint
 *
 * WHY IT MATTERS:
 *
 * WITHOUT RATE LIMITING:
 * ❌ Attacker brute-forces passwords (1000 attempts/sec)
 * ❌ Bot scrapes entire catalog (10k requests/min)
 * ❌ Malicious user exhausts AI quota (1000 generations/hour)
 * ❌ Single user monopolizes resources (99% CPU usage)
 *
 * WITH RATE LIMITING:
 * ✅ Login: 5 attempts / 15 minutes (prevent brute-force)
 * ✅ Catalog: 100 requests / minute (normal browsing, block scrapers)
 * ✅ AI: 10 requests / minute (fair resource sharing)
 * ✅ Payments: 3 attempts / hour (prevent fraud testing)
 *
 * IMPLEMENTATION:
 * - Uses MongoDB for rate limit counters (persists across restarts)
 * - Tracks by IP for anonymous users
 * - Tracks by userId for authenticated users
 * - Configurable limits per route via decorator
 *
 * PRODUCTION SCENARIO:
 *
 * Attack: Attacker tries to brute-force admin password
 * - Attempt 1-5: Allowed (normal login attempts)
 * - Attempt 6+: Blocked with 429 "Too many requests, retry in 15 minutes"
 * - Attacker IP is blocked for 15 minutes
 * - Admin account remains safe
 *
 * INTERVIEW POINTS:
 *
 * Q: "How do you prevent brute-force attacks?"
 * A: Rate limiting. Limit login attempts to 5 per 15 minutes per IP.
 *    After 5 failed attempts, block further tries. Prevents automated
 *    password guessing. Also add CAPTCHA after 3 attempts for human verification.
 *
 * Q: "Why rate limit per user AND per IP?"
 * A: Defense in depth:
 *    - Per IP: Block bots (shared IP, no auth)
 *    - Per user: Prevent compromised account abuse (different IPs)
 *    Example: Stolen API key used from 1000 IPs → per-user limit stops it
 *
 * Q: "What if legitimate user hits rate limit?"
 * A: Show clear error: "You've made too many requests. Try again in 5 minutes."
 *    Balance security vs UX. For critical endpoints (payments), strict limits.
 *    For browsing (catalog), generous limits (100 req/min is ~1 page load/sec).
 *
 * Q: "MongoDB vs Redis for rate limiting?"
 * A: Redis is faster (~1ms vs ~10ms) and has TTL built-in. Use Redis at scale.
 *    MongoDB works for < 1000 req/sec and we already have it in stack.
 *    Would migrate to Redis if rate limiting becomes bottleneck.
 *
 * TRADEOFFS:
 * - ✅ Prevents abuse and attacks
 * - ✅ Fair resource sharing across users
 * - ✅ Protects downstream services (databases, AI providers)
 * - ❌ Can frustrate legitimate power users
 * - ❌ Adds latency (~10ms MongoDB query per request)
 * - ❌ Complex to tune (too strict → user frustration, too loose → abuse)
 */

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

// Decorator to set rate limit per route
export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface RateLimitRecord {
  key: string; // IP or userId
  count: number;
  resetAt: Date;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly COLLECTION_NAME = 'rate_limits';

  constructor(
    private reflector: Reflector,
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.ensureIndexes();
  }

  private async ensureIndexes() {
    try {
      const collection = this.connection.collection(this.COLLECTION_NAME);

      // TTL index for automatic cleanup
      await collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 });

      // Unique index on key
      await collection.createIndex({ key: 1 }, { unique: true });
    } catch (error: any) {
      console.warn('Rate limit index creation warning:', error?.message);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get rate limit config from decorator
    const rateLimitConfig = this.reflector.get<{
      limit: number;
      windowMs: number;
    }>(RATE_LIMIT_KEY, context.getHandler());

    // If no decorator, no rate limiting
    if (!rateLimitConfig) {
      return true;
    }

    const { limit, windowMs } = rateLimitConfig;
    const request = context.switchToHttp().getRequest<Request>();

    // Identify user (prefer userId over IP for authenticated requests)
    const userId = (request as any).user?.userId || (request as any).user?.sub;
    const identifier = userId || this.getClientIp(request);

    // Create key: endpoint + identifier
    const endpoint = `${request.method}:${request.route?.path || request.path}`;
    const key = `${endpoint}:${identifier}`;

    const collection = this.connection.collection(this.COLLECTION_NAME);
    const now = new Date();

    try {
      // Get current rate limit record
      const record = await collection.findOne<RateLimitRecord>({ key });

      if (!record) {
        // First request in window
        await collection.insertOne({
          key,
          count: 1,
          resetAt: new Date(Date.now() + windowMs),
        });

        this.setRateLimitHeaders(context, limit, limit - 1, windowMs);
        return true;
      }

      if (now > record.resetAt) {
        // Window expired, reset counter
        await collection.updateOne(
          { key },
          {
            $set: {
              count: 1,
              resetAt: new Date(Date.now() + windowMs),
            },
          },
        );

        this.setRateLimitHeaders(context, limit, limit - 1, windowMs);
        return true;
      }

      if (record.count >= limit) {
        // Rate limit exceeded
        const retryAfterSeconds = Math.ceil(
          (record.resetAt.getTime() - now.getTime()) / 1000,
        );

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

      // Increment counter
      await collection.updateOne({ key }, { $inc: { count: 1 } });

      const remaining = limit - (record.count + 1);
      this.setRateLimitHeaders(context, limit, remaining, windowMs);

      return true;
    } catch (error) {
      // If rate limiting fails, log but allow request (fail open)
      // Better to risk abuse than block legitimate traffic
      console.error('[RateLimit] Error checking rate limit:', error);
      return true;
    }
  }

  /**
   * Set standard rate limit headers (RFC 6585)
   */
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

  /**
   * Extract client IP from request
   * Handles proxied requests (X-Forwarded-For, X-Real-IP)
   */
  private getClientIp(request: Request): string {
    // Check X-Forwarded-For header (from proxy/load balancer)
    const forwardedFor = request.header('x-forwarded-for');
    if (forwardedFor) {
      // X-Forwarded-For can be comma-separated list, take first IP
      return forwardedFor.split(',')[0].trim();
    }

    // Check X-Real-IP header (from Nginx)
    const realIp = request.header('x-real-ip');
    if (realIp) {
      return realIp;
    }

    // Fall back to socket IP
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}

/**
 * USAGE IN CONTROLLER:
 *
 * import { RateLimit, RateLimitGuard } from './common/guards/rate-limit.guard';
 *
 * @Controller('auth')
 * export class AuthController {
 *   // Login: 5 attempts per 15 minutes
 *   @Post('login')
 *   @RateLimit(5, 15 * 60 * 1000)
 *   @UseGuards(RateLimitGuard)
 *   async login(@Body() loginDto: LoginDto) {
 *     return this.authService.login(loginDto);
 *   }
 *
 *   // Password reset: 3 attempts per hour
 *   @Post('forgot-password')
 *   @RateLimit(3, 60 * 60 * 1000)
 *   @UseGuards(RateLimitGuard)
 *   async forgotPassword(@Body() dto: ForgotPasswordDto) {
 *     return this.authService.forgotPassword(dto.email);
 *   }
 * }
 *
 * @Controller('ai')
 * export class AIController {
 *   // AI generation: 10 requests per minute
 *   @Post('generate')
 *   @RateLimit(10, 60 * 1000)
 *   @UseGuards(RateLimitGuard)
 *   async generate(@Body() dto: GenerateDto) {
 *     return this.aiService.generate(dto);
 *   }
 * }
 *
 * @Controller('catalog')
 * export class CatalogController {
 *   // Catalog browsing: 100 requests per minute
 *   @Get('products')
 *   @RateLimit(100, 60 * 1000)
 *   @UseGuards(RateLimitGuard)
 *   async getProducts(@Query() query: ProductQueryDto) {
 *     return this.catalogService.getProducts(query);
 *   }
 * }
 *
 * GLOBAL USAGE (apply to all routes):
 *
 * import { APP_GUARD } from '@nestjs/core';
 * import { RateLimitGuard } from './common/guards/rate-limit.guard';
 *
 * @Module({
 *   providers: [
 *     {
 *       provide: APP_GUARD,
 *       useClass: RateLimitGuard,
 *     },
 *   ],
 * })
 * export class AppModule {}
 *
 * FRONTEND HANDLING:
 *
 * async function loginUser(email, password) {
 *   try {
 *     const response = await fetch('/auth/login', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ email, password }),
 *     });
 *
 *     if (response.status === 429) {
 *       const retryAfter = response.headers.get('Retry-After');
 *       throw new Error(
 *         `Too many login attempts. Please try again in ${retryAfter} seconds.`
 *       );
 *     }
 *
 *     return response.json();
 *   } catch (error) {
 *     // Show user-friendly error
 *     alert(error.message);
 *   }
 * }
 *
 * RECOMMENDED LIMITS:
 *
 * | Endpoint | Limit | Window | Reasoning |
 * |----------|-------|--------|-----------|
 * | **Login** | 5 | 15 min | Prevent brute-force |
 * | **Register** | 3 | hour | Prevent fake account spam |
 * | **Password Reset** | 3 | hour | Prevent email bombing |
 * | **AI Generation** | 10 | minute | Fair resource sharing |
 * | **Catalog Browsing** | 100 | minute | Normal user ~10 req/min |
 * | **Payments** | 3 | hour | Prevent card testing fraud |
 * | **Admin Actions** | 50 | minute | Higher limit for staff |
 *
 * BYPASS FOR TESTING:
 *
 * Add IP whitelist for dev/staging:
 *
 * private isWhitelisted(ip: string): boolean {
 *   const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
 *   return whitelist.includes(ip);
 * }
 *
 * async canActivate(context: ExecutionContext): Promise<boolean> {
 *   const request = context.switchToHttp().getRequest<Request>();
 *   const ip = this.getClientIp(request);
 *
 *   if (this.isWhitelisted(ip)) {
 *     return true; // Skip rate limiting
 *   }
 *
 *   // ... normal rate limiting
 * }
 *
 * MONITORING & ALERTING:
 *
 * Track rate limit hits in logs:
 *
 * logger.warn({
 *   event: 'rate_limit_exceeded',
 *   endpoint,
 *   identifier,
 *   count: record.count,
 *   limit,
 * });
 *
 * Alert if:
 * - Single IP hits rate limit > 10 times/hour (potential attack)
 * - > 100 users hit rate limit (limits too strict)
 *
 * MIGRATION TO REDIS:
 *
 * When to migrate:
 * - > 1000 req/sec (MongoDB becomes bottleneck)
 * - Need < 5ms latency (MongoDB is ~10ms)
 * - Need atomic increment (MongoDB $inc is not truly atomic across shards)
 *
 * Redis implementation:
 *
 * import { InjectRedis } from '@nestjs-modules/ioredis';
 * import { Redis } from 'ioredis';
 *
 * async canActivate(context: ExecutionContext): Promise<boolean> {
 *   const key = `ratelimit:${endpoint}:${identifier}`;
 *   const current = await this.redis.incr(key);
 *
 *   if (current === 1) {
 *     // First request, set TTL
 *     await this.redis.expire(key, Math.ceil(windowMs / 1000));
 *   }
 *
 *   if (current > limit) {
 *     const ttl = await this.redis.ttl(key);
 *     throw new HttpException(...);
 *   }
 *
 *   return true;
 * }
 *
 * Redis benefits:
 * - ~1ms latency (10x faster than MongoDB)
 * - Atomic INCR (thread-safe)
 * - Built-in TTL (no manual cleanup)
 * - Less storage (no document overhead)
 *
 * DISTRIBUTED RATE LIMITING:
 *
 * Problem: Multiple backend instances with separate counters
 * - Instance A: User makes 5 requests (allowed)
 * - Instance B: Same user makes 5 requests (allowed)
 * - Total: 10 requests (should be blocked)
 *
 * Solution: Shared storage (MongoDB or Redis)
 * - All instances read/write same counters
 * - Rate limit is enforced globally
 *
 * COST OF ABUSE:
 *
 * Without rate limiting:
 * - Bot hits AI endpoint 10k times/hour
 * - OpenAI API cost: 10k × $0.002 = $20/hour = $14,400/month
 * - With rate limiting (10 req/min): $0.30/hour = $216/month
 *
 * Rate limiting saved: $14,184/month
 */
