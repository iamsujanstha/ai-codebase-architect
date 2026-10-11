import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Structured Logging Interceptor
 * 
 * CRITICAL: Production systems need structured, queryable logs.
 * 
 * WHAT IT DOES:
 * 1. Logs every request/response with structured JSON
 * 2. Includes correlation ID, user ID, duration, status code
 * 3. Logs errors with full context (not just stack trace)
 * 4. Enables log aggregation (ELK, Datadog, CloudWatch)
 * 
 * WHY NOT CONSOLE.LOG:
 * ❌ console.log('User 123 created order')
 *    - Not queryable (can't filter by userId)
 *    - No correlation ID (can't trace request)
 *    - No metadata (timestamp, level, service)
 *    - Hard to parse in log aggregation tools
 * 
 * ✅ logger.log({ event: 'order_created', userId: 123, orderId: 'abc' })
 *    - Queryable: event:"order_created" AND userId:123
 *    - Structured: Every field is indexed
 *    - Traceable: Includes correlationId automatically
 * 
 * PRODUCTION SCENARIO:
 * Support ticket: "User reports payment failed 30 minutes ago"
 * 
 * Without structured logs:
 * - Grep logs for user email (hope it's in logs)
 * - Find timestamp (if clocks are synced)
 * - Read through text logs manually
 * - Miss related errors in other services
 * 
 * With structured logs:
 * - Query: userId:123 AND timestamp:>30m AND level:error
 * - Get all errors for that user in last 30 minutes
 * - Filter by service: service:"backend" OR service:"ai-service"
 * - Group by correlationId to see request flow
 * 
 * STRUCTURE EXAMPLE:
 * {
 *   "timestamp": "2024-10-10T12:00:00.123Z",
 *   "level": "info",
 *   "service": "backend",
 *   "correlationId": "abc-123-def-456",
 *   "userId": "user_789",
 *   "event": "order_created",
 *   "method": "POST",
 *   "path": "/payments/checkout",
 *   "statusCode": 201,
 *   "duration": 245,
 *   "metadata": {
 *     "orderId": "order_abc",
 *     "total": 199.99,
 *     "provider": "stripe"
 *   }
 * }
 * 
 * INTERVIEW POINTS:
 * - Q: "How do you debug production issues?"
 *   A: Structured logging + correlation IDs. Every log is JSON with:
 *      - timestamp, level, service, correlationId
 *      - User context (userId, email)
 *      - Business context (orderId, paymentStatus)
 *      Query logs like a database, not grep text files.
 * 
 * - Q: "Why not just use console.log?"
 *   A: console.log is fine for development. Production needs:
 *      - Queryable logs (filter by user, error type, time range)
 *      - Correlation across services (trace request end-to-end)
 *      - Aggregation (count errors per endpoint, latency percentiles)
 *      Text logs don't support this. Structured JSON does.
 * 
 * - Q: "What's the performance impact?"
 *   A: ~1-2ms per request (JSON serialization). Negligible compared to
 *      DB queries (10-50ms) or AI generation (seconds). Worth the cost
 *      for production observability.
 * 
 * TRADEOFFS:
 * - ✅ Queryable logs (filter, aggregate, alert)
 * - ✅ Correlation across services
 * - ✅ Machine-readable (parse with jq, ship to ELK/Datadog)
 * - ✅ Consistent format (every log has same fields)
 * - ❌ Slightly slower than plain console.log (~1ms)
 * - ❌ Harder to read raw logs (JSON vs plain text)
 * - ❌ Requires log aggregation to see benefits (local files are messy)
 */

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const { method, url, headers } = request;
    const correlationId = request.correlationId;
    const userId = (request as any).user?.userId || (request as any).user?.sub;
    
    const startTime = Date.now();

    return next.handle().pipe(
      tap((data) => {
        // SUCCESS: Log response
        const duration = Date.now() - startTime;
        
        this.logger.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            service: 'backend',
            correlationId,
            userId,
            event: 'request_success',
            method,
            path: this.sanitizePath(url),
            statusCode: response.statusCode,
            duration,
            userAgent: headers['user-agent'],
            // Don't log response body (may contain PII/secrets)
            // responseSize: JSON.stringify(data).length,
          }),
        );
      }),
      catchError((error) => {
        // ERROR: Log with full context
        const duration = Date.now() - startTime;
        
        this.logger.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: 'backend',
            correlationId,
            userId,
            event: 'request_error',
            method,
            path: this.sanitizePath(url),
            statusCode: error.status || 500,
            duration,
            errorName: error.name,
            errorMessage: error.message,
            // Stack trace is useful but verbose; include first few lines
            stackTrace: error.stack?.split('\n').slice(0, 5).join('\n'),
            // Business context (if available)
            context: error.context || {},
          }),
        );
        
        // Re-throw so exception filter handles it
        throw error;
      }),
    );
  }

  /**
   * Remove sensitive data from URL path
   * Example: /users/123/token/abc123 → /users/:id/token/:token
   */
  private sanitizePath(url: string): string {
    // Remove query parameters (may contain secrets)
    const path = url.split('?')[0];
    
    // TODO: Implement path parameter masking
    // For now, return as-is (no UUIDs/tokens in our paths yet)
    return path;
  }
}

/**
 * USAGE IN MAIN.TS:
 * 
 * import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
 * 
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   
 *   // Apply globally
 *   app.useGlobalInterceptors(new LoggingInterceptor());
 *   
 *   await app.listen(3000);
 * }
 * 
 * USAGE IN SERVICE (business event logging):
 * 
 * @Injectable()
 * export class PaymentsService {
 *   private readonly logger = new Logger(PaymentsService.name);
 *   
 *   async createOrder(userId: string, items: CartItem[]) {
 *     const orderId = generateOrderId();
 *     
 *     // Log business event (not HTTP request)
 *     this.logger.log(
 *       JSON.stringify({
 *         timestamp: new Date().toISOString(),
 *         level: 'info',
 *         event: 'order_created',
 *         userId,
 *         orderId,
 *         itemCount: items.length,
 *         total: calculateTotal(items),
 *       })
 *     );
 *     
 *     // ... create order
 *   }
 * }
 * 
 * LOG AGGREGATION QUERIES:
 * 
 * # Find all errors in last hour
 * level:error AND timestamp:>1h
 * 
 * # Find slow requests (> 1 second)
 * duration:>1000 AND event:request_success
 * 
 * # Find all requests for specific user
 * userId:"user_123"
 * 
 * # Find all payment-related errors
 * path:"/payments/*" AND level:error
 * 
 * # Count errors by endpoint (aggregation)
 * SELECT path, COUNT(*) FROM logs
 * WHERE level = 'error'
 * GROUP BY path
 * ORDER BY COUNT(*) DESC
 * 
 * PRODUCTION SETUP:
 * 
 * 1. LOCAL DEVELOPMENT:
 *    - Logs go to console (Docker logs)
 *    - View with: docker compose logs -f backend
 *    - Parse with: docker compose logs backend | jq .
 * 
 * 2. PRODUCTION (AWS):
 *    - Logs go to stdout → CloudWatch Logs
 *    - CloudWatch Insights queries:
 *      fields @timestamp, correlationId, userId, event, duration
 *      | filter level = "error"
 *      | sort @timestamp desc
 * 
 * 3. PRODUCTION (ELK):
 *    - Logs go to stdout → Filebeat → Elasticsearch
 *    - Kibana queries: level:error AND service:backend
 *    - Create dashboards: Error rate, P95 latency, Request volume
 * 
 * 4. PRODUCTION (Datadog):
 *    - Logs go to Datadog Agent → Datadog platform
 *    - Queries: service:backend status:error
 *    - Automatic APM traces (if agent configured)
 * 
 * BEST PRACTICES:
 * 
 * 1. ALWAYS INCLUDE:
 *    - timestamp (ISO 8601)
 *    - level (info, warn, error)
 *    - correlationId (trace requests)
 *    - service name (in multi-service architecture)
 * 
 * 2. AVOID LOGGING:
 *    - Passwords, tokens, API keys
 *    - Full request/response bodies (may contain PII)
 *    - Large objects (logs become huge)
 *    - Secrets in error messages
 * 
 * 3. LOG LEVELS:
 *    - ERROR: Something failed (user impact)
 *    - WARN: Something unusual (no immediate impact)
 *    - INFO: Important business events (order created, payment succeeded)
 *    - DEBUG: Detailed info (only in development)
 * 
 * 4. RETENTION:
 *    - Hot storage: 7-30 days (fast queries)
 *    - Cold storage: 90-365 days (compliance, archives)
 *    - Delete after retention period (GDPR compliance)
 * 
 * OBSERVABILITY TRIAD:
 * 
 * This interceptor covers LOGS.
 * Complete observability requires:
 * 
 * 1. LOGS (this file)
 *    - What happened? (events, errors)
 *    - Use for: Debugging, error tracking
 * 
 * 2. METRICS (TODO: add Prometheus/StatsD)
 *    - How much? How fast? (counts, rates, latencies)
 *    - Use for: Alerting, dashboards, capacity planning
 * 
 * 3. TRACES (TODO: add OpenTelemetry)
 *    - Where did time go? (distributed request timeline)
 *    - Use for: Performance debugging, service dependencies
 * 
 * NEXT STEPS:
 * 
 * 1. Add metrics collection (request count, error rate, latency percentiles)
 * 2. Add OpenTelemetry for distributed tracing
 * 3. Create alerting rules (error rate > 5%, latency P95 > 1s)
 * 4. Build dashboards (Grafana, CloudWatch, Datadog)
 * 
 * COST CONSIDERATIONS:
 * 
 * - CloudWatch Logs: $0.50/GB ingested + $0.03/GB stored
 * - Datadog: $0.10/GB ingested (expensive at scale)
 * - ELK self-hosted: EC2 costs + maintenance effort
 * 
 * At 100 req/sec × 1KB/log = 8.6 GB/day = $130/month (CloudWatch)
 * 
 * Optimize:
 * - Sample logs (log 10% of success, 100% of errors)
 * - Reduce verbosity (don't log every DB query)
 * - Archive to S3 after 7 days ($0.02/GB/month)
 */
