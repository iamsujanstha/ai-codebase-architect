import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID Middleware
 *
 * CRITICAL: Enables request tracing across distributed systems.
 *
 * WHAT IT DOES:
 * 1. Generates unique ID for each request (if not provided)
 * 2. Adds ID to request object (accessible in controllers/services)
 * 3. Returns ID in response header (X-Correlation-ID)
 * 4. Propagates ID to downstream services (AI service, external APIs)
 *
 * WHY IT MATTERS:
 * - Trace a user's request through: Frontend → Nginx → NestJS → FastAPI → LLM
 * - Debug production issues: "Find all logs for correlation ID abc-123"
 * - Performance analysis: "How long did request abc-123 take end-to-end?"
 * - Error tracking: "Which requests failed in the last hour?"
 *
 * PRODUCTION SCENARIO:
 * User reports: "My payment failed at 2:30 PM"
 *
 * WITHOUT correlation ID:
 * - Search logs by timestamp (finds 1000+ requests at 2:30 PM)
 * - Guess which request was theirs
 * - Can't trace across services (NestJS logs vs FastAPI logs disconnected)
 *
 * WITH correlation ID:
 * - Frontend sends X-Correlation-ID in error report
 * - Search: `correlationId: "abc-123"` → finds exact request path
 * - Trace: User request → Backend → Stripe webhook → Order update
 * - Root cause: Stripe webhook signature verification failed
 *
 * OPENTELEMETRY INTEGRATION:
 * This middleware lays foundation for distributed tracing.
 * Later, correlation ID becomes OpenTelemetry trace ID.
 *
 * INTERVIEW POINTS:
 * - Q: "How do you debug a production issue across microservices?"
 *   A: Correlation IDs. Every request gets unique ID, propagated to all services.
 *      Logs include ID, making it trivial to trace request flow.
 *
 * - Q: "Why not just use timestamp?"
 *   A: Multiple requests happen at same millisecond. Correlation ID is unique.
 *      Also, clocks drift across servers. IDs don't.
 *
 * - Q: "What if client doesn't send correlation ID?"
 *   A: We generate one. Client can optionally send (useful for client-side error tracking).
 *
 * TRADEOFFS:
 * - ✅ Essential for debugging distributed systems
 * - ✅ Minimal overhead (~1ms to generate UUID)
 * - ✅ Works with any log aggregation system
 * - ❌ Requires all services to propagate ID (discipline)
 * - ❌ Logs must be structured JSON (plain text logs lose benefits)
 */

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly CORRELATION_ID_HEADER = 'x-correlation-id';

  use(req: Request, res: Response, next: NextFunction) {
    // Check if client provided correlation ID (e.g., from frontend retry)
    let correlationId = req.header(this.CORRELATION_ID_HEADER);

    // If not provided, generate new UUID
    if (!correlationId) {
      correlationId = randomUUID();
    }

    // Attach to request object (accessible in controllers/services)
    req.correlationId = correlationId;

    // Return in response header (client can log for debugging)
    res.setHeader(this.CORRELATION_ID_HEADER, correlationId);

    // Log request start (enables "request began" → "request completed" matching)
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        correlationId,
        event: 'request_started',
        method: req.method,
        path: req.path,
        userAgent: req.header('user-agent'),
        ip: req.ip,
      }),
    );

    // Capture response finish time
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      console.log(
        JSON.stringify({
          level: 'info',
          timestamp: new Date().toISOString(),
          correlationId,
          event: 'request_completed',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
        }),
      );
    });

    next();
  }
}

/**
 * HELPER: Extract correlation ID from request
 * Use this in services that need the ID
 */
export function getCorrelationId(req: Request): string | undefined {
  return req.correlationId;
}

/**
 * USAGE IN MODULE:
 *
 * import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
 * import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
 *
 * @Module({ ... })
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     // Apply to ALL routes
 *     consumer.apply(CorrelationIdMiddleware).forRoutes('*');
 *   }
 * }
 *
 * USAGE IN SERVICE (propagate to downstream service):
 *
 * async callAIService(req: Request, prompt: string) {
 *   const response = await fetch('http://ai-service:8000/generate', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'X-Correlation-ID': req.correlationId, // PROPAGATE ID
 *     },
 *     body: JSON.stringify({ prompt }),
 *   });
 *   return response.json();
 * }
 *
 * USAGE IN CONTROLLER (access correlation ID):
 *
 * @Controller('payments')
 * export class PaymentsController {
 *   @Post('checkout')
 *   async createCheckout(@Req() req: Request) {
 *     const correlationId = req.correlationId;
 *
 *     this.logger.log({
 *       correlationId,
 *       event: 'checkout_started',
 *       userId: req.user.id,
 *     });
 *
 *     // ... create checkout
 *   }
 * }
 *
 * FRONTEND USAGE (include in error reports):
 *
 * async function createOrder(items) {
 *   try {
 *     const response = await fetch('/payments/checkout', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ items }),
 *     });
 *
 *     const correlationId = response.headers.get('X-Correlation-ID');
 *
 *     if (!response.ok) {
 *       // Include correlation ID in error report
 *       throw new Error(`Payment failed [${correlationId}]`);
 *     }
 *
 *     return response.json();
 *   } catch (error) {
 *     // User sees: "Payment failed [abc-123-def-456]"
 *     // Support team searches logs for: abc-123-def-456
 *     console.error(error);
 *   }
 * }
 *
 * LOG AGGREGATION (search by correlation ID):
 *
 * # Find all logs for specific request
 * grep "abc-123-def-456" /var/log/app.log
 *
 * # Or in ELK/Datadog:
 * correlationId:"abc-123-def-456"
 *
 * # Result:
 * 2024-10-10T12:00:00Z [abc-123] request_started GET /products
 * 2024-10-10T12:00:00Z [abc-123] query_mongodb { collection: "products" }
 * 2024-10-10T12:00:01Z [abc-123] mongodb_result { count: 24, duration: 15ms }
 * 2024-10-10T12:00:01Z [abc-123] request_completed GET /products 200 (16ms)
 *
 * OPENTELEMETRY UPGRADE PATH:
 *
 * When adding OpenTelemetry:
 * 1. Replace correlationId with trace.id from span context
 * 2. Keep X-Correlation-ID header for backward compatibility
 * 3. Inject trace context into downstream calls (W3C Trace Context format)
 * 4. Logs automatically include trace.id and span.id
 *
 * import { trace } from '@opentelemetry/api';
 *
 * const span = trace.getActiveSpan();
 * const traceId = span?.spanContext().traceId;
 *
 * PRODUCTION BENEFITS:
 *
 * 1. DEBUGGING
 *    Problem: "Payment webhook failed"
 *    Solution: Search logs by webhook's correlation ID → trace back to original checkout
 *
 * 2. PERFORMANCE ANALYSIS
 *    Problem: "Checkout is slow"
 *    Solution: Sample 100 requests, analyze duration per correlation ID
 *
 * 3. ERROR TRACKING
 *    Problem: "Some users see 500 errors"
 *    Solution: Filter errors by correlation ID → identify affected requests
 *
 * 4. CROSS-SERVICE TRACING
 *    Request flow:
 *    Frontend [abc-123] → NestJS [abc-123] → FastAPI [abc-123] → Ollama
 *
 *    All services log with same ID → complete request timeline
 *
 * FAILURE MODES:
 *
 * Q: What if downstream service doesn't propagate correlation ID?
 * A: Logs are disconnected. Must ensure all services follow pattern.
 *    Solution: Create shared middleware library or enforce via API gateway.
 *
 * Q: What if correlation ID is lost during async processing (queue)?
 * A: Include ID in job metadata:
 *    await queue.add('process-pdf', { pdfId, correlationId });
 *
 * Q: What if we have circular dependencies (A calls B calls A)?
 * A: Correlation ID traces full cycle. Add span IDs (parent/child) for finer detail.
 *    This is where OpenTelemetry shines (automatic span creation).
 */
